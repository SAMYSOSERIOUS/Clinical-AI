import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND_URL = process.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

const backendProxy = {
  target: BACKEND_URL,
  changeOrigin: true,
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all backend API routes — eliminates CORS preflight in dev
      '/predict':     backendProxy,
      '/recall-curve': backendProxy,
      '/audit':       backendProxy,
      '/upload':      backendProxy,
      '/chat':        backendProxy,
      '/health':      backendProxy,
    },
  },
})
