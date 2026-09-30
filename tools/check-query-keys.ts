// Fails when a React Query key is written inline instead of coming from `qk`.
// Usage: `bun tools/check-query-keys.ts`.
const root = `${import.meta.dir}/../packages/frontend/src`;
const allowed = "lib/query-keys.ts";
const inlineKey = /queryKey:\s*\[|(?:setQueryData|getQueryData|removeQueries)\(\s*\[/;

const offenders: string[] = [];
for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan(root)) {
  if (path === allowed) continue;
  const lines = (await Bun.file(`${root}/${path}`).text()).split("\n");
  lines.forEach((line, i) => {
    if (inlineKey.test(line)) offenders.push(`${path}:${i + 1}: ${line.trim()}`);
  });
}

if (offenders.length > 0) {
  console.error(`Inline query keys found, use \`qk\` from lib/query-keys.ts:\n${offenders.join("\n")}`);
  process.exit(1);
}
