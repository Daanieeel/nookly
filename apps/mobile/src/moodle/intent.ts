/// The page a link opening Nookly goes to when it is Moodle's sign in (`nookly://token=...`),
/// or null for any other link.
export function signInPath(path: string): string | null {
  return /(^|\/)token=/.test(path) ? `/moodle-signin?link=${encodeURIComponent(path)}` : null;
}
