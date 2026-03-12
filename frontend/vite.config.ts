import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// proxy target is only used in dev; in production VITE_API_URL is baked in at build time
const DEV_BACKEND = 'http://127.0.0.1:8001';

// If the browser sends a page-navigation request (Accept: text/html), let Vite
// handle it with its SPA fallback instead of proxying to the backend — this
// fixes the "Method Not Allowed" error when you refresh /predict or /chat.
const backendProxy = {
  target: DEV_BACKEND,
  changeOrigin: true,
  bypass(req: { headers: { accept?: string } }) {
    if (req.headers.accept?.includes('text/html')) return '/index.html';
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all backend API routes — eliminates CORS preflight in dev
      '/predict':      backendProxy,
      '/recall-curve': backendProxy,
      '/audit':        backendProxy,
      '/upload':       backendProxy,
      '/chat':         backendProxy,
      '/health':       backendProxy,
    },
  },
})
