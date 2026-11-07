import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { global: "globalThis" },
  server: {
    fs: { allow: [".."] },
    proxy: { "/api": process.env.VITE_API_PROXY || "http://localhost:8787" },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
