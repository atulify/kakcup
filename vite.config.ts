import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
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
          'react-vendor': ['react', 'react-dom', 'wouter'],
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

          // Notification/overlay components
          'ui-overlays': [
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
