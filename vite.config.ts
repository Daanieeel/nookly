import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
// @ts-expect-error type error without @types/node package
import fs from "node:fs";

// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// react-flagpack v2 renders `<img src="/flags/{size}/{code}.svg">` and expects the SVGs to be
// copied into the static folder by its postinstall CLI. Serve them straight from the package in
// dev and copy them into the build output instead, so nothing generated lives in `public/`.
const flagpackDir = path.resolve(import.meta.dirname, "node_modules/react-flagpack/dist/flags");

function flagpackAssets(): Plugin {
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

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), flagpackAssets()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
