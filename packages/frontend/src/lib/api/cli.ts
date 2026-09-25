import { invoke } from "@tauri-apps/api/core";

export interface CliInstallStatus {
  supported: boolean;
  installed: boolean;
  linkDir: string | null;
  targetPath: string | null;
  shellHint: string | null;
}

export function getCliInstallStatus(): Promise<CliInstallStatus> {
  return invoke("cli_install_status");
}

export function installCli(): Promise<CliInstallStatus> {
  return invoke("install_cli");
}
