import domains from "./disposable-domains.txt" with { type: "text" };

export const DISPOSABLE_EMAIL_MESSAGE = "Use a permanent email address.";

/// Throwaway mail services (Mailinator, 10 Minute Mail and the like), one domain per line.
/// The list is disposable-email-domains' (CC0), refreshed by `bun run disposable:update`.
const BLOCKED = new Set(
  domains
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean),
);

/// Whether an address belongs to a throwaway mail service. A subdomain of a listed domain
/// counts too (`inbox.mailinator.com`), a look alike (`notmailinator.com`) does not.
export function isDisposableEmail(address: string): boolean {
  const at = address.lastIndexOf("@");
  if (at < 0) return false;
  const labels = address
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .split(".");
  for (let start = 0; start < labels.length - 1; start++) {
    if (BLOCKED.has(labels.slice(start).join("."))) return true;
  }
  return false;
}
