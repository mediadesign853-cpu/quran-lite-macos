import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import precachePlugin from './scripts/precache-plugin.mjs';
import devPagesPlugin from './scripts/dev-pages-plugin.mjs';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), devPagesPlugin(), precachePlugin(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
