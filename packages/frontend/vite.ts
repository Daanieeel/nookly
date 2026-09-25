// Vite plugins the frontend needs from whichever app bundles it.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";

// react-flagpack v2 renders `<img src="/flags/{size}/{code}.svg">` and expects the SVGs to be
// copied into the static folder by its postinstall CLI. Serve them straight from the package in
// dev and copy them into the build output instead, so nothing generated lives in `public/`.
const flagpackDir = path.join(
  path.dirname(createRequire(import.meta.url).resolve("react-flagpack")),
  "flags",
);

export function flagpackAssets(): Plugin {
  let outDir = "";
  return {
    name: "nookly:flagpack-assets",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use("/flags", (req, res, next) => {
        const file = path.join(flagpackDir, decodeURIComponent((req.url ?? "").split("?")[0]));
        if (!file.startsWith(flagpackDir + path.sep) || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "image/svg+xml");
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      fs.cpSync(flagpackDir, path.join(outDir, "flags"), { recursive: true });
    },
  };
}
