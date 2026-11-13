import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Requests to /api go to the server runtime (`npm run dev:server`).
const proxy = { '/api': 'http://127.0.0.1:8787' };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
