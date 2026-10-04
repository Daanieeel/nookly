//! Backup and restore round trips: a restore brings back exactly what was
//! backed up (every table, row by row, and every stored file byte for byte),
//! a backup from an older schema is migrated forward on the next launch, and a
//! damaged backup or a restore that fails midway never touches live data.

use super::*;
use crate::db;
use crate::db::migration_upgrade_tests::{
    dump, latest, migrate_to, populate, verify_upgraded, Dump, Fixture, OLDEST_RELEASED_VERSION,
};
use std::collections::{BTreeMap, BTreeSet};

fn scratch(label: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-{label}-{}", db::new_id()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn db_path(dir: &Path) -> PathBuf {
    dir.join(DB_FILE)
}

/// A data folder whose database sits at `version` and holds the populated
/// fixture, plus stored files of every kind a backup carries.
fn data_dir_at(dir: &Path, version: usize) -> Fixture {
    fs::create_dir_all(dir).unwrap();
    let mut conn = Connection::open(db_path(dir)).unwrap();
    migrate_to(&mut conn, version);
    let fixture = populate(&conn);
    drop(conn);
    for (file, bytes) in [
        ("files/slides.pdf", &b"%PDF stored file"[..]),
        ("recipe-banners/e-recipe.png", &b"\x89PNG banner"[..]),
        ("bookmark-previews/e-bmk.jpg", &b"\xff\xd8 jpeg"[..]),
        ("preferences.json", &b"{\"nookly:theme\":\"dark\"}"[..]),
        ("external-calendars.json", &b"{}"[..]),
    ] {
        let path = dir.join(file);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }
    fixture
}

/// The live database, opened without migrating it.
fn raw(dir: &Path) -> Connection {
    Connection::open(db_path(dir)).unwrap()
}

/// Backs up `dir` the way the `create_backup` command does: snapshot of the
/// open connection, then the archive. The database is not migrated first.
fn back_up(dir: &Path, dest: &Path, keep: usize) -> BackupInfo {
    let conn = raw(dir);
    create_backup(snapshot(&conn).unwrap(), dir, dest, keep).unwrap()
}

/// What the app does on its next launch: install a staged restore, then open
/// (and migrate) the database.
fn launch(dir: &Path) -> (Option<PathBuf>, Connection) {
    let applied = apply_pending_restore(dir).unwrap();
    (applied, db::connect(dir).unwrap())
}

/// Every stored file under `dir` a backup is meant to carry, with its bytes.
fn stored_files(dir: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        for entry in fs::read_dir(dir).unwrap().flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if dir == root && (is_excluded(&name) || is_database_file(&name)) {
                continue;
            }
            let kind = entry.file_type().unwrap();
            if kind.is_dir() {
                walk(root, &path, out);
            } else if kind.is_file() {
                let rel = path
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned();
                out.insert(rel, fs::read(&path).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(dir, dir, &mut out);
    out
}

/// The live state of a data folder: every table row by row and every file.
fn state(dir: &Path) -> (usize, Dump, BTreeMap<String, Vec<u8>>) {
    let conn = raw(dir);
    (
        db::schema_version(&conn).unwrap(),
        dump(&conn),
        stored_files(dir),
    )
}

fn cleanup(dirs: impl IntoIterator<Item = PathBuf>) {
    for dir in dirs {
        fs::remove_dir_all(dir).ok();
    }
}

/// A different, populated install to restore over.
fn other_install() -> PathBuf {
    let dir = scratch("target");
    let conn = db::connect(&dir).unwrap();
    db::spaces::create_space(&conn, "Other".into(), None, "#fff".into()).unwrap();
    drop(conn);
    fs::create_dir_all(dir.join("files")).unwrap();
    fs::write(dir.join("files/other.pdf"), b"other").unwrap();
    dir
}

#[test]
fn restore_brings_back_every_table_row_by_row() {
    let source = scratch("source");
    let fixture = data_dir_at(&source, latest());
    let before = state(&source);
    let dest = scratch("dest");
    let info = back_up(&source, &dest, 10);
    let manifest = info.manifest.clone().unwrap();
    assert_eq!(manifest.schema_version, latest());
    assert_eq!(manifest.file_count, 5);
    // The referenced (not copied) file of the fixture is counted, not stored.
    assert_eq!(manifest.referenced_files, 1);
    // Backing up changes nothing live.
    assert_eq!(state(&source), before);

    let target = other_install();
    let target_before = state(&target);
    stage_restore(&target, Path::new(&info.path)).unwrap();
    // Staging alone leaves the live install untouched.
    assert_eq!(state(&target), target_before);

    let (safety, conn) = launch(&target);
    let safety = safety.expect("a restore was applied");
    assert_eq!(dump(&conn), before.1);
    assert_eq!(state(&target), before);
    verify_upgraded(&conn, &fixture);
    drop(conn);

    // The replaced install is kept whole in the safety folder.
    let kept = Connection::open(safety.join(DB_FILE)).unwrap();
    assert_eq!(dump(&kept), target_before.1);
    assert_eq!(stored_files(&safety), target_before.2);
    cleanup([source, dest, target]);
}

#[test]
fn trash_and_hidden_entities_survive_a_round_trip() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    let trashed = |conn: &Connection| -> Vec<(String, Option<String>, Option<String>)> {
        let mut stmt = conn
            .prepare(
                "SELECT id, deleted_at, hidden_at FROM entities
                 WHERE deleted_at IS NOT NULL ORDER BY id",
            )
            .unwrap();
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    };
    let before = trashed(&raw(&source));
    assert!(before.len() >= 5, "the fixture holds trash: {before:?}");
    assert!(before.iter().any(|(_, _, hidden)| hidden.is_some()));

    let dest = scratch("dest");
    let info = back_up(&source, &dest, 10);
    let target = other_install();
    stage_restore(&target, Path::new(&info.path)).unwrap();
    let (_, conn) = launch(&target);
    assert_eq!(trashed(&conn), before);
    for (table, id) in [
        ("index_cards", "card-trash"),
        ("recipe_ingredients", "ing-trash"),
    ] {
        let deleted: Option<String> = conn
            .query_row(
                &format!("SELECT deleted_at FROM {table} WHERE id = ?1"),
                [id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(deleted.is_some(), "{table} {id} still in trash");
    }
    drop(conn);
    cleanup([source, dest, target]);
}

/// A backup taken by an older release restores with today's code and is
/// migrated forward on the next launch, for every past schema version.
#[test]
fn a_backup_from_every_older_schema_is_migrated_forward_on_restore() {
    for version in 1..latest() {
        let source = scratch("old-source");
        let fixture = data_dir_at(&source, version);
        let before = state(&source);
        let dest = scratch("dest");
        let info = back_up(&source, &dest, 10);
        assert_eq!(info.manifest.unwrap().schema_version, version);
        assert_eq!(
            inspect_backup(Path::new(&info.path))
                .unwrap()
                .schema_version,
            version
        );

        let target = other_install();
        stage_restore(&target, Path::new(&info.path)).unwrap();
        let (_, conn) = launch(&target);
        verify_upgraded(&conn, &fixture);
        assert_eq!(stored_files(&target), before.2, "version {version}: files");
        drop(conn);
        // The restored pre-upgrade database is kept as `connect` promises.
        let kept = target.join(format!("{DB_FILE}.bak-v{version}"));
        assert!(kept.is_file(), "version {version}: pre-upgrade copy");
        assert_eq!(dump(&Connection::open(&kept).unwrap()), before.1);
        cleanup([source, dest, target]);
    }
}

#[test]
fn the_oldest_released_backup_restores_onto_a_current_install() {
    let source = scratch("oldest");
    let fixture = data_dir_at(&source, OLDEST_RELEASED_VERSION);
    let dest = scratch("dest");
    let info = back_up(&source, &dest, 10);
    let target = other_install();
    let target_before = state(&target);
    stage_restore(&target, Path::new(&info.path)).unwrap();
    let (safety, conn) = launch(&target);
    verify_upgraded(&conn, &fixture);
    drop(conn);
    let kept = Connection::open(safety.unwrap().join(DB_FILE)).unwrap();
    assert_eq!(dump(&kept), target_before.1);
    cleanup([source, dest, target]);
}

/// Every way a backup file can be damaged is refused before anything live
/// changes, and leaves no staged restore behind for the next launch.
#[test]
fn damaged_backups_are_refused_without_touching_live_data() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    let dest = scratch("dest");
    let info = back_up(&source, &dest, 10);
    let good = fs::read(&info.path).unwrap();
    let bad = scratch("bad");

    let mut cases: Vec<(&str, Vec<u8>)> = vec![
        ("truncated to half", good[..good.len() / 2].to_vec()),
        ("last byte cut", good[..good.len() - 1].to_vec()),
        ("empty file", Vec::new()),
        ("not a zip", b"this is not a zip archive at all".to_vec()),
    ];
    // A flipped byte inside the compressed database fails its CRC.
    let mut flipped = good.clone();
    flipped[200] ^= 0xff;
    cases.push(("flipped byte", flipped));

    let target = other_install();
    let before = state(&target);
    for (label, bytes) in cases {
        let path = bad.join(format!("{label}.zip"));
        fs::write(&path, bytes).unwrap();
        assert!(inspect_backup(&path).is_err(), "{label}: inspect");
        assert!(stage_restore(&target, &path).is_err(), "{label}: stage");
        assert!(
            !target.join(PENDING_DIR).exists(),
            "{label}: nothing staged"
        );
        assert!(apply_pending_restore(&target).unwrap().is_none());
        assert_eq!(state(&target), before, "{label}: live data untouched");
    }
    // The original backup itself is still fine.
    assert!(inspect_backup(Path::new(&info.path)).is_ok());
    cleanup([source, dest, bad, target]);
}

fn manifest_for(schema_version: usize, file_count: usize) -> Manifest {
    Manifest {
        format_version: FORMAT_VERSION,
        app_version: "0.0.0".into(),
        schema_version,
        created_at: db::now(),
        file_count,
        bytes: 0,
        referenced_files: 0,
    }
}

fn handmade_zip(path: &Path, entries: &[(&str, Vec<u8>)], manifest: Option<&Manifest>) {
    let mut zip = ZipWriter::new(File::create(path).unwrap());
    let opts = zip_options(CompressionMethod::Deflated);
    for (name, bytes) in entries {
        zip.start_file(*name, opts).unwrap();
        zip.write_all(bytes).unwrap();
    }
    if let Some(manifest) = manifest {
        zip.start_file(MANIFEST, opts).unwrap();
        zip.write_all(&serde_json::to_vec(manifest).unwrap())
            .unwrap();
    }
    zip.finish().unwrap();
}

/// Archives that are valid zips but not a usable backup.
#[test]
fn well_formed_zips_that_are_not_valid_backups_are_refused() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    let snap = snapshot(&raw(&source)).unwrap();
    let real_db = fs::read(&snap.path).unwrap();
    fs::remove_file(&snap.path).ok();
    let mut damaged_db = real_db.clone();
    // Scribble over the second page (the first holds the header).
    for byte in &mut damaged_db[4096..4096 + 512] {
        *byte = 0xa5;
    }

    let bad = scratch("bad");
    type Entries<'a> = Vec<(&'a str, Vec<u8>)>;
    let cases: Vec<(&str, Entries, Option<Manifest>)> = vec![
        ("no manifest", vec![(DB_FILE, real_db.clone())], None),
        (
            "no database",
            vec![("files/a.pdf", b"x".to_vec())],
            Some(manifest_for(latest(), 1)),
        ),
        (
            "database is garbage",
            vec![(DB_FILE, b"definitely not sqlite".repeat(300))],
            Some(manifest_for(latest(), 0)),
        ),
        (
            "database pages damaged",
            vec![(DB_FILE, damaged_db)],
            Some(manifest_for(latest(), 0)),
        ),
        (
            "manifest names another schema",
            vec![(DB_FILE, real_db.clone())],
            Some(manifest_for(3, 0)),
        ),
        (
            "fewer files than the manifest says",
            vec![(DB_FILE, real_db.clone())],
            Some(manifest_for(latest(), 2)),
        ),
        (
            "newer format",
            vec![(DB_FILE, real_db.clone())],
            Some(Manifest {
                format_version: FORMAT_VERSION + 1,
                ..manifest_for(latest(), 0)
            }),
        ),
        (
            "restore machinery path",
            vec![
                (DB_FILE, real_db.clone()),
                ("restore-safety/x/nookly.db", b"x".to_vec()),
            ],
            Some(manifest_for(latest(), 1)),
        ),
    ];

    let target = other_install();
    let before = state(&target);
    for (label, entries, manifest) in cases {
        let path = bad.join(format!("{label}.zip"));
        handmade_zip(&path, &entries, manifest.as_ref());
        assert!(stage_restore(&target, &path).is_err(), "{label}: refused");
        assert!(
            !target.join(PENDING_DIR).exists(),
            "{label}: nothing staged"
        );
        assert_eq!(state(&target), before, "{label}: live data untouched");
    }
    // A handmade archive holding the real database is accepted, which shows
    // the cases above fail for the reason they name.
    let ok = bad.join("ok.zip");
    handmade_zip(&ok, &[(DB_FILE, real_db)], Some(&manifest_for(latest(), 0)));
    stage_restore(&target, &ok).unwrap();
    cleanup([source, bad, target]);
}

/// A step of the install failing midway (here: an incoming entry can't be
/// moved over a folder the restore never swaps) undoes every move, so the live
/// install is exactly as it was and nothing is left to retry next launch.
#[test]
fn a_restore_failing_midway_leaves_the_live_install_as_it_was() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    let dest = scratch("dest");
    let info = back_up(&source, &dest, 10);

    let target = other_install();
    fs::create_dir_all(target.join("office-previews")).unwrap();
    fs::write(target.join("office-previews/cache.pdf"), b"cache").unwrap();
    let before = state(&target);
    stage_restore(&target, Path::new(&info.path)).unwrap();
    // Sabotage: an entry whose rename onto a non-empty folder must fail.
    fs::create_dir_all(target.join(PENDING_DIR).join("office-previews")).unwrap();
    fs::write(
        target
            .join(PENDING_DIR)
            .join("office-previews/incoming.pdf"),
        b"incoming",
    )
    .unwrap();

    let err = apply_pending_restore(&target).unwrap_err();
    log_restore_error(&target, &err);
    assert_eq!(state(&target), before);
    assert_eq!(
        fs::read(target.join("office-previews/cache.pdf")).unwrap(),
        b"cache"
    );
    assert!(
        !target.join(PENDING_DIR).exists(),
        "not retried every launch"
    );
    let safety_root = target.join(SAFETY_DIR);
    let leftovers: Vec<_> = fs::read_dir(&safety_root)
        .map(|d| d.flatten().collect())
        .unwrap_or_default();
    assert!(leftovers.is_empty(), "empty safety folder removed");
    assert!(fs::read_to_string(target.join(RESTORE_ERROR_LOG))
        .unwrap()
        .contains("your data was left as it was"));
    // The database still opens normally afterwards.
    let (applied, conn) = launch(&target);
    assert!(applied.is_none());
    assert_eq!(dump(&conn), before.1);
    drop(conn);
    cleanup([source, dest, target]);
}

/// The safety folder is named by the second. Two restores applied within the
/// same second (or after the clock went back) share it.
#[test]
fn a_safety_folder_from_the_same_second_is_overwritten() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    let dest = scratch("dest");
    let info = back_up(&source, &dest, 10);
    let target = other_install();
    stage_restore(&target, Path::new(&info.path)).unwrap();

    // An earlier restore's safety copy, under every name this restore could pick.
    let now = chrono::Utc::now();
    let stamps: Vec<String> = (0..3)
        .map(|s| {
            (now + chrono::Duration::seconds(s))
                .format("%Y%m%d-%H%M%S")
                .to_string()
        })
        .collect();
    for stamp in &stamps {
        let earlier = target.join(SAFETY_DIR).join(stamp);
        fs::create_dir_all(&earlier).unwrap();
        fs::write(earlier.join(DB_FILE), b"EARLIER SAFETY COPY").unwrap();
    }

    let safety = apply_pending_restore(&target).unwrap().unwrap();
    assert!(stamps.iter().any(|s| safety.ends_with(s)));
    // NOTE: possible bug: `apply_pending_restore` renames the live database
    // into an existing `restore-safety/<second>/`, silently replacing the copy
    // an earlier restore kept there. Unique folder names would avoid it.
    assert_ne!(
        fs::read(safety.join(DB_FILE)).unwrap(),
        b"EARLIER SAFETY COPY"
    );
    cleanup([source, dest, target]);
}

/// Several backups in a row, with changes in between: each one restores to
/// the state it was taken at.
#[test]
fn repeated_backups_each_restore_their_own_state() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    let dest = scratch("dest");
    let mut taken = Vec::new();
    for n in 0..3 {
        let conn = raw(&source);
        db::spaces::create_space(&conn, format!("Space {n}"), None, "#000".into()).unwrap();
        drop(conn);
        fs::write(source.join(format!("files/added-{n}.txt")), format!("{n}")).unwrap();
        let info = back_up(&source, &dest, 10);
        taken.push((info, state(&source)));
    }
    let names: BTreeSet<&str> = taken.iter().map(|(i, _)| i.name.as_str()).collect();
    assert_eq!(names.len(), 3, "every backup has its own file");
    assert_eq!(list_backups(&dest).unwrap().len(), 3);

    for (info, expected) in &taken {
        let target = other_install();
        stage_restore(&target, Path::new(&info.path)).unwrap();
        let (_, conn) = launch(&target);
        drop(conn);
        assert_eq!(&state(&target), expected, "{}", info.name);
        cleanup([target]);
    }
    cleanup([source, dest]);
}

/// Two backups in the same second get `name.zip` and `name-2.zip`, and
/// `-2` sorts before `.zip`.
#[test]
fn backups_taken_in_the_same_second_are_listed_oldest_first() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    for _ in 0..5 {
        let dest = scratch("dest");
        let first = back_up(&source, &dest, 10);
        let second = back_up(&source, &dest, 10);
        if !second.name.ends_with("-2.zip") {
            // Crossed a second boundary; try again.
            cleanup([dest]);
            continue;
        }
        // NOTE: possible bug: the newer backup (`-2`) sorts before the older
        // one, so `list_backups` shows the older one as newest and `prune`
        // would delete the newer one first (it only spares the one just made).
        let listed: Vec<String> = list_backups(&dest)
            .unwrap()
            .into_iter()
            .map(|b| b.name)
            .collect();
        assert_eq!(listed, vec![first.name.clone(), second.name.clone()]);
        // With keep = 1 a third backup in the same second keeps more than one.
        let third = back_up(&source, &dest, 1);
        if third.name.ends_with("-3.zip") {
            assert!(list_backups(&dest).unwrap().len() > 1);
        }
        cleanup([dest]);
        break;
    }
    cleanup([source]);
}

/// Stored files of every shape come back byte for byte; references to files
/// outside the app folder are counted but not copied; symlinks are skipped.
#[test]
fn stored_files_round_trip_byte_for_byte() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    let binary: Vec<u8> = (0..=255u8).cycle().take(300_000).collect();
    let files: Vec<(&str, Vec<u8>)> = vec![
        (
            "files/2026/semester one/lecture \u{fc}\u{e9}.pdf",
            binary.clone(),
        ),
        (
            "files/\u{65e5}\u{672c}\u{8a9e}/notes.bin",
            binary.iter().rev().copied().collect(),
        ),
        ("files/empty.txt", Vec::new()),
        ("files/photo.JPG", b"\xff\xd8\xff jpeg".to_vec()),
        ("files/.hidden", b"dotfile".to_vec()),
        ("recipe-banners/deep/a/b/c.webp", b"webp".to_vec()),
        ("some-future-folder/data.json", b"{\"a\":1}".to_vec()),
    ];
    for (name, bytes) in &files {
        let path = source.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }
    fs::create_dir_all(source.join("files/empty-folder")).unwrap();
    let outside = scratch("outside");
    fs::write(outside.join("secret.txt"), b"outside").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.join("secret.txt"), source.join("files/link.txt")).unwrap();

    let before = stored_files(&source);
    let dest = scratch("dest");
    let info = back_up(&source, &dest, 10);
    let manifest = info.manifest.unwrap();
    assert_eq!(manifest.referenced_files, 1);
    // Five fixture files plus the ones above; the symlink is not one of them.
    assert_eq!(manifest.file_count, 5 + files.len());

    let target = other_install();
    stage_restore(&target, Path::new(&info.path)).unwrap();
    let (_, conn) = launch(&target);
    drop(conn);
    let after = stored_files(&target);
    for (name, bytes) in &files {
        assert_eq!(after.get(*name), Some(bytes), "{name}");
    }
    assert!(
        !target.join("files/link.txt").exists(),
        "symlink not followed"
    );
    assert!(!after.values().any(|b| b == b"outside"));
    // NOTE: possible bug: empty folders are not part of a backup (only files
    // are zipped), so they don't come back. No data is lost, only the folder.
    assert!(!target.join("files/empty-folder").exists());
    let mut expected = before.clone();
    expected.remove("files/link.txt");
    assert_eq!(after, expected);
    cleanup([source, dest, target, outside]);
}

/// Data folder, backup folder and file names with spaces and non ASCII.
#[test]
fn paths_with_spaces_and_unicode_round_trip() {
    let root = scratch("paths");
    let source = root.join("Nookly Daten \u{fc}\u{e4}\u{f6} \u{65e5}\u{672c} \u{1f4da}");
    let fixture = data_dir_at(&source, OLDEST_RELEASED_VERSION);
    fs::write(
        source.join("files/caf\u{e9} men\u{fc} \u{2615}.txt"),
        b"menu",
    )
    .unwrap();
    let before = state(&source);
    let dest = root.join("My Backups/Sicherung \u{e9}t\u{e9} 2026");
    let info = back_up(&source, &dest, 10);
    assert!(Path::new(&info.path).starts_with(&dest));
    assert_eq!(list_backups(&dest).unwrap().len(), 1);

    let target = root.join("Ziel Ordner \u{3b1}\u{3b2}\u{3b3}");
    data_dir_at(&target, latest());
    stage_restore(&target, Path::new(&info.path)).unwrap();
    let (_, conn) = launch(&target);
    verify_upgraded(&conn, &fixture);
    drop(conn);
    assert_eq!(stored_files(&target), before.2);
    cleanup([root]);
}

/// A backup folder inside the data folder, with a name that needs quoting.
#[test]
fn a_backup_folder_inside_the_data_folder_restores_cleanly() {
    let source = scratch("source");
    data_dir_at(&source, latest());
    let dest = source.join("Backups \u{fc}");
    let first = back_up(&source, &dest, 10);
    let before = state(&source);
    let target = other_install();
    stage_restore(&target, Path::new(&first.path)).unwrap();
    let (_, conn) = launch(&target);
    drop(conn);
    let mut expected = before.2.clone();
    expected.retain(|name, _| !name.starts_with("Backups"));
    assert_eq!(stored_files(&target), expected);
    cleanup([source, target]);
}
