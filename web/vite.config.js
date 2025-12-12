import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Polyfill for node-forge in browser
      'node-forge': 'node-forge/dist/forge.min.js',
    },
  },
  optimizeDeps: {
    include: ['node-forge'],
  },
})
