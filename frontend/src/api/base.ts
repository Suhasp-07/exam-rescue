/**
 * Base URL prefix for backend API calls.
 *
 * - In local dev (`npm run dev`), leave VITE_API_BASE_URL unset. Requests
 *   stay relative ("/api/...") and are handled by Vite's dev-server proxy
 *   (see vite.config.ts), which forwards them to http://localhost:4000.
 * - In a production build (e.g. deployed to Cloudflare Pages), there is no
 *   dev proxy — set VITE_API_BASE_URL to your deployed backend's full URL
 *   (e.g. "https://exam-rescue-backend.onrender.com") at build time, and
 *   requests will go straight there instead.
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "";
