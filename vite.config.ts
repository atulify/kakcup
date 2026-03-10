import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

function getCommitHash(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

/** Vite plugin: after build, rewrite sw.js to precache all built assets. */
function swPrecachePlugin(outDir: string): Plugin {
  return {
    name: "sw-precache",
    apply: "build",
    closeBundle() {
      const manifestPath = path.resolve(outDir, ".vite/manifest.json");
      if (!fs.existsSync(manifestPath)) return;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      // Start with static assets that aren't in the Vite manifest
      const assets = new Set<string>([
        "/",
        "/icon-192.png",
        "/icon-180.png",
        "/fonts/fonts.css",
        "/fonts/inter-latin.woff2",
      ]);
      for (const entry of Object.values(manifest) as any[]) {
        if (entry.file) assets.add("/" + entry.file);
        for (const css of entry.css ?? []) assets.add("/" + css);
      }

      const swPath = path.resolve(outDir, "sw.js");
      if (!fs.existsSync(swPath)) return;
      let sw = fs.readFileSync(swPath, "utf-8");
      // Replace the urlsToCache array
      const urlsArray = JSON.stringify([...assets], null, 2);
      sw = sw.replace(
        /const urlsToCache = \[[\s\S]*?\];/,
        `const urlsToCache = ${urlsArray};`,
      );
      fs.writeFileSync(swPath, sw);
    },
  };
}

const outDir = path.resolve(import.meta.dirname, "dist/public");

export default defineConfig({
  plugins: [
    preact(),
    swPrecachePlugin(outDir),
  ],
  define: {
    __COMMIT_HASH__: JSON.stringify(getCommitHash()),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "react": "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir,
    emptyOutDir: true,
    manifest: true,
    target: 'esnext',
    cssCodeSplit: true, // Enable CSS code splitting for lazy-loaded components
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          // Core framework dependencies
          'framework': ['preact', 'preact/compat', 'wouter'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
