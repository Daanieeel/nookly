//! The AI apps the Agent settings can open the agent folder in. Nookly only starts the app
//! with the folder's path: it runs no agent, calls no model and stores no keys.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// One app the folder can be opened in. Adding another is one entry here and one in the
/// frontend's `ai-apps.tsx` (its logo).
struct AiApp {
    id: &'static str,
    name: &'static str,
    /// Names of the macOS app bundle, without `.app`.
    mac_bundles: &'static [&'static str],
    /// Paths of the program on Windows, below `%LOCALAPPDATA%\Programs` or `%ProgramFiles%`.
    windows_programs: &'static [&'static str],
    /// Commands on the PATH that open a window on a folder. Terminal agents are not listed:
    /// they need a terminal to run in, and nothing here opens one.
    folder_commands: &'static [&'static str],
}

const APPS: &[AiApp] = &[
    AiApp {
        id: "claude",
        name: "Claude",
        mac_bundles: &["Claude"],
        windows_programs: &["AnthropicClaude\\claude.exe", "Claude\\Claude.exe"],
        folder_commands: &[],
    },
    AiApp {
        id: "chatgpt",
        name: "ChatGPT",
        mac_bundles: &["ChatGPT", "Codex"],
        windows_programs: &["ChatGPT\\ChatGPT.exe", "Codex\\Codex.exe"],
        folder_commands: &[],
    },
    AiApp {
        id: "cursor",
        name: "Cursor",
        mac_bundles: &["Cursor"],
        windows_programs: &["cursor\\Cursor.exe"],
        folder_commands: &["cursor"],
    },
    AiApp {
        id: "vscode",
        name: "VS Code",
        mac_bundles: &["Visual Studio Code"],
        windows_programs: &["Microsoft VS Code\\Code.exe"],
        folder_commands: &["code"],
    },
];

#[derive(Debug, Clone, Copy, PartialEq)]
enum Platform {
    Mac,
    Windows,
    Other,
}

const PLATFORM: Platform = if cfg!(target_os = "macos") {
    Platform::Mac
} else if cfg!(target_os = "windows") {
    Platform::Windows
} else {
    Platform::Other
};

/// Where to look, passed in so tests can say what is installed.
struct Probe<'a> {
    exists: &'a dyn Fn(&Path) -> bool,
    /// The folders of the PATH.
    path_dirs: Vec<PathBuf>,
    home: Option<PathBuf>,
    local_app_data: Option<PathBuf>,
    program_files: Option<PathBuf>,
}

/// How an installed app is started.
#[derive(Debug, PartialEq)]
enum Launcher {
    /// `open -a <name> <folder>`.
    MacBundle(String),
    /// The program itself, with the folder as its argument.
    Program(PathBuf),
}

fn find(app: &AiApp, platform: Platform, probe: &Probe) -> Option<Launcher> {
    let by_command = || {
        app.folder_commands.iter().find_map(|command| {
            let file = if platform == Platform::Windows {
                format!("{command}.cmd")
            } else {
                (*command).to_string()
            };
            probe
                .path_dirs
                .iter()
                .map(|dir| dir.join(&file))
                .find(|path| (probe.exists)(path))
                .map(Launcher::Program)
        })
    };
    match platform {
        Platform::Mac => {
            let mut roots = vec![PathBuf::from("/Applications")];
            roots.extend(probe.home.iter().map(|home| home.join("Applications")));
            app.mac_bundles
                .iter()
                .find(|bundle| {
                    roots
                        .iter()
                        .any(|root| (probe.exists)(&root.join(format!("{bundle}.app"))))
                })
                .map(|bundle| Launcher::MacBundle((*bundle).to_string()))
                .or_else(by_command)
        }
        Platform::Windows => {
            let roots: Vec<PathBuf> = probe
                .local_app_data
                .iter()
                .map(|dir| dir.join("Programs"))
                .chain(probe.local_app_data.iter().cloned())
                .chain(probe.program_files.iter().cloned())
                .collect();
            app.windows_programs
                .iter()
                .flat_map(|program| roots.iter().map(move |root| root.join(program)))
                .find(|path| (probe.exists)(path))
                .map(Launcher::Program)
                .or_else(by_command)
        }
        Platform::Other => by_command(),
    }
}

/// The program and arguments that start `launcher` on `folder`.
fn command_for(launcher: &Launcher, folder: &Path) -> (String, Vec<String>) {
    let folder = folder.to_string_lossy().to_string();
    match launcher {
        Launcher::MacBundle(bundle) => ("open".into(), vec!["-a".into(), bundle.clone(), folder]),
        Launcher::Program(program) => (program.to_string_lossy().to_string(), vec![folder]),
    }
}

fn real_probe<'a>(exists: &'a dyn Fn(&Path) -> bool) -> Probe<'a> {
    let var = |name: &str| std::env::var_os(name).map(PathBuf::from);
    Probe {
        exists,
        path_dirs: std::env::var_os("PATH")
            .map(|path| std::env::split_paths(&path).collect())
            .unwrap_or_default(),
        home: var("HOME"),
        local_app_data: var("LOCALAPPDATA"),
        program_files: var("ProgramFiles"),
    }
}

fn installed(exists: &dyn Fn(&Path) -> bool) -> Vec<(&'static AiApp, Launcher)> {
    let probe = real_probe(exists);
    APPS.iter()
        .filter_map(|app| find(app, PLATFORM, &probe).map(|launcher| (app, launcher)))
        .collect()
}

#[derive(Serialize)]
pub struct AiAppInfo {
    pub id: &'static str,
    pub name: &'static str,
}

/// The apps found on this computer, in the order the frontend should offer them.
#[tauri::command]
pub fn list_ai_apps() -> Vec<AiAppInfo> {
    installed(&|path| path.exists())
        .into_iter()
        .map(|(app, _)| AiAppInfo {
            id: app.id,
            name: app.name,
        })
        .collect()
}

/// Starts an installed app on the agent folder. The folder is Nookly's own, never a path the
/// caller names.
#[tauri::command]
pub fn open_agent_dir_in(app: AppHandle, app_id: String) -> AppResult<()> {
    let folder = super::agent_files::agent_dir_path(app)?;
    let found = installed(&|path| path.exists());
    let (ai_app, launcher) = found
        .iter()
        .find(|(candidate, _)| candidate.id == app_id)
        .ok_or_else(|| AppError::NotFound(format!("{app_id} is not installed")))?;
    let (program, args) = command_for(launcher, Path::new(&folder));
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| AppError::Io(format!("Couldn't start {}: {e}", ai_app.name)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn app(id: &str) -> &'static AiApp {
        APPS.iter().find(|a| a.id == id).unwrap()
    }

    fn probe<'a>(exists: &'a dyn Fn(&Path) -> bool) -> Probe<'a> {
        Probe {
            exists,
            path_dirs: vec![PathBuf::from("/usr/local/bin"), PathBuf::from("/usr/bin")],
            home: Some(PathBuf::from("/Users/me")),
            local_app_data: Some(PathBuf::from("C:\\Users\\me\\AppData\\Local")),
            program_files: Some(PathBuf::from("C:\\Program Files")),
        }
    }

    fn present(paths: &[&str]) -> impl Fn(&Path) -> bool {
        let set: HashSet<PathBuf> = paths.iter().map(PathBuf::from).collect();
        move |path| set.contains(path)
    }

    #[test]
    fn every_app_has_a_unique_id_and_a_name() {
        let ids: HashSet<_> = APPS.iter().map(|a| a.id).collect();
        assert_eq!(ids.len(), APPS.len());
        assert!(APPS.iter().all(|a| !a.name.is_empty()));
    }

    #[test]
    fn a_mac_app_is_found_in_applications_or_the_home_applications_folder() {
        let exists = present(&[
            "/Applications/Cursor.app",
            "/Users/me/Applications/Claude.app",
        ]);
        let p = probe(&exists);
        assert_eq!(
            find(app("cursor"), Platform::Mac, &p),
            Some(Launcher::MacBundle("Cursor".into()))
        );
        assert_eq!(
            find(app("claude"), Platform::Mac, &p),
            Some(Launcher::MacBundle("Claude".into()))
        );
        assert_eq!(find(app("vscode"), Platform::Mac, &p), None);
    }

    #[test]
    fn a_mac_app_with_another_bundle_name_is_found() {
        let exists = present(&["/Applications/Codex.app"]);
        assert_eq!(
            find(app("chatgpt"), Platform::Mac, &probe(&exists)),
            Some(Launcher::MacBundle("Codex".into()))
        );
    }

    #[test]
    fn an_editor_on_the_path_is_found_where_there_is_no_app() {
        let exists = present(&["/usr/local/bin/code"]);
        let p = probe(&exists);
        assert_eq!(
            find(app("vscode"), Platform::Other, &p),
            Some(Launcher::Program(PathBuf::from("/usr/local/bin/code")))
        );
        // The apps without a folder command are not offered on Linux.
        assert_eq!(find(app("claude"), Platform::Other, &p), None);
    }

    #[test]
    fn a_windows_program_is_found_below_programs() {
        let exe = "C:\\Users\\me\\AppData\\Local\\Programs".to_string() + "\\cursor\\Cursor.exe";
        let exists = present(&[exe.as_str()]);
        // `Path::join` uses the separator of the machine running the test.
        let expected = PathBuf::from("C:\\Users\\me\\AppData\\Local")
            .join("Programs")
            .join("cursor\\Cursor.exe");
        let found = find(
            app("cursor"),
            Platform::Windows,
            &probe(&|p| p == expected || exists(p)),
        );
        assert_eq!(found, Some(Launcher::Program(expected)));
    }

    #[test]
    fn nothing_installed_finds_nothing() {
        let exists = present(&[]);
        let p = probe(&exists);
        for platform in [Platform::Mac, Platform::Windows, Platform::Other] {
            assert!(APPS.iter().all(|a| find(a, platform, &p).is_none()));
        }
    }

    #[test]
    fn a_mac_bundle_opens_with_open_a_and_a_program_gets_the_folder() {
        let folder = Path::new("/data/agent");
        assert_eq!(
            command_for(&Launcher::MacBundle("Visual Studio Code".into()), folder),
            (
                "open".to_string(),
                vec![
                    "-a".to_string(),
                    "Visual Studio Code".to_string(),
                    "/data/agent".to_string()
                ]
            )
        );
        assert_eq!(
            command_for(&Launcher::Program(PathBuf::from("/usr/bin/code")), folder),
            ("/usr/bin/code".to_string(), vec!["/data/agent".to_string()])
        );
    }
}
