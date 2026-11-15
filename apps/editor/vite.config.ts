import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Requests to /api go to the server runtime (`npm run dev:server`).
const proxy = { '/api': 'http://127.0.0.1:8787' };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy,
    // The editor, its Logic tab and published apps are loaded on their own
    // (main.tsx, App.tsx); prepare them as soon as the dev server starts.
    warmup: { clientFiles: ['./src/app/App.tsx', './src/app/LogicWorkspace.tsx', './src/app/PublishedApp.tsx'] },
  },
  preview: { proxy },
});
