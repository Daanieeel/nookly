/// A string made of the same kinds of characters as `value` but none of them: letters for
/// letters, digits for digits, the rest (spaces, dashes) kept. What a hidden secret shows in
/// its place, so that selecting it, copying it or reading the screen gives nothing away. It is
/// a decoy, not a secret itself, so plain randomness will do (and it works on the phone too).
export function scramble(value: string): string {
  const random = (limit: number) => Math.floor(Math.random() * limit);
  return Array.from(value, (char) => {
    if (/[0-9]/.test(char)) return String(random(10));
    if (/[A-Za-z]/.test(char)) return String.fromCharCode(65 + random(26));
    return char;
  }).join("");
}
