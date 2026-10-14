/// Writes the phone's NativeWind theme from the desktop's (see `nativeThemeCss`).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nativeThemeCss } from "../packages/shared/src/native-theme.ts";

const ui = join(import.meta.dir, "../packages/ui/src");
writeFileSync(
  join(ui, "native-theme.css"),
  nativeThemeCss(readFileSync(join(ui, "styles.css"), "utf8")),
);
console.log("Wrote packages/ui/src/native-theme.css");
