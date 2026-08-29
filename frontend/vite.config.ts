import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind to all interfaces so a tunnel (ngrok/cloudflared) can reach this
    // dev server, not just 127.0.0.1.
    host: true,
    // Vite 5 blocks requests with an unrecognized Host header by default
    // (e.g. "abc123.ngrok-free.app" or "xyz.trycloudflare.com"). `true`
    // disables that check entirely — fine for a temporary public demo, but
    // don't leave this running unattended for long since it's your own
    // machine being exposed.
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
