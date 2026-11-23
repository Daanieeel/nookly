// Refreshes src/security/disposable-domains.txt from disposable-email-domains (CC0).
const SOURCE =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";
const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`The list answered ${response.status}`);
const text = await response.text();
const lines = text.split("\n").filter((line) => line.trim());
// A broken download must not wipe the list.
if (lines.length < 1000) throw new Error(`Only ${lines.length} domains; not replacing the list`);
await Bun.write(
  new URL("../src/security/disposable-domains.txt", import.meta.url),
  `${lines.join("\n")}\n`,
);
console.log(`${lines.length} domains`);
