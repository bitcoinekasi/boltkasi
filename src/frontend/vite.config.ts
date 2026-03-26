import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../../dist/public'),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
      '/lnurlw': 'http://localhost:3001',
      '/lnurlp': 'http://localhost:3001',
      '/.well-known': 'http://localhost:3001',
    },
  },
})
