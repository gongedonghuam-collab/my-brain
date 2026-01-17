import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "logo.png"],
      manifest: {
        name: "My Brain - AI Knowledge Base",
        short_name: "My Brain",
        description: "AIがあなたの記憶をサポートする、あなただけの第2の脳。",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        icons: [
          {
            src: "logo.png?v=3", // ★ここを変更
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "logo.png?v=3", // ★ここを変更
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "logo.png?v=3", // ★ここを変更
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
