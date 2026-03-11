import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    wasm(), // Allows importing .wasm files
    topLevelAwait(), // Allows "await" at the top of the file
  ],
  server: {
    fs: {
      // Allow serving files from the project root (one level up)
      allow: [".."],
    },
  },
});
