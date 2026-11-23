/// The username of an account made with another provider, which has none until it picks one.

/// What a username may be: the same as the sign up form takes.
export const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/;
export const USERNAME_RULE = "Use 3 to 30 letters, numbers, dots or underscores";

/// A name to start from: what the other account calls the person, made to fit. Empty when
/// nothing usable is left.
export function suggestUsername(name: string): string {
  const fitted = name
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.]/g, "")
    .slice(0, 30);
  return fitted.length >= 3 ? fitted.toLowerCase() : "";
}
