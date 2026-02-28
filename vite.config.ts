import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "path";

export default defineConfig({
  plugins: [
    preact(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "react": "preact/compat",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: true, // Enable CSS code splitting for lazy-loaded components
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Core framework dependencies
          'framework': ['preact', 'preact/compat', 'wouter'],
          'query-vendor': ['@tanstack/react-query'],

          // Split UI components into smaller, more granular chunks
          // Core UI primitives used throughout the app
          'ui-core': [
            '@radix-ui/react-slot',
            '@radix-ui/react-label',
          ],

          // Tab components (used in YearPage)
          'ui-tabs': [
            '@radix-ui/react-tabs',
          ],

          // Toast notifications
          'ui-toast': [
            '@radix-ui/react-toast',
          ],
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
