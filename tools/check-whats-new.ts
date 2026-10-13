// Fails when whats-new.json has a version the What's new dialog would skip: a bad version or
// date, a title without a summary (or the other way round), an unknown tag, or a version
// listed twice. Usage: `bun tools/check-whats-new.ts`.
import { whatsNewIssues } from "../packages/frontend/src/lib/whats-new.ts";

const issues = whatsNewIssues();
if (issues.length > 0) {
  console.error(`whats-new.json is not valid:\n${issues.map((i) => `  ${i}`).join("\n")}`);
  process.exit(1);
}
console.log("whats-new.json OK.");
