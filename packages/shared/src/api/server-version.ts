import serverPackage from "../../../../apps/server/package.json" with { type: "json" };

/// The version of Nookly's server this build of the app was made for: the one in
/// `apps/server/package.json` when the app was built.
export const EXPECTED_SERVER_VERSION: string = serverPackage.version;

/// The header every answer of the server carries its version in. Errors repeat it as
/// `serverVersion` in their body.
export const SERVER_VERSION_HEADER = "x-nookly-server-version";

/// The codes of an error that says one side is out of date.
export const SERVER_OUTDATED = "server_outdated";
export const APP_OUTDATED = "app_outdated";

export const SERVER_OUTDATED_MESSAGE =
  "Nookly's server is out of date. Try again once it has been updated.";
export const APP_OUTDATED_MESSAGE =
  "This version of Nookly is out of date. Update the app to keep syncing.";

const parse = (version: string) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match ? ([Number(match[1]), Number(match[2]), Number(match[3])] as const) : null;
};

/// Which side is out of date when the server could not make sense of a request, or the app of
/// its answer. A server older than the app expects, or one that does not say (the ones from
/// before it did), is the server. One a major or minor version ahead is the app: a newer patch
/// changes nothing an app depends on. The same version, or a newer patch, is nobody's doing.
export function versionProblem(serverVersion: string | null | undefined): "server" | "app" | null {
  const server = serverVersion ? parse(serverVersion) : null;
  const expected = parse(EXPECTED_SERVER_VERSION);
  if (!server || !expected) return "server";
  for (const i of [0, 1, 2] as const) {
    if (server[i] < expected[i]) return "server";
    if (server[i] > expected[i]) return i === 2 ? null : "app";
  }
  return null;
}
