import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Tauri 需要固定端口 + 指定 host，避免 webview 白屏
export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  build: {
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  },
  envPrefix: ['VITE_', 'TAURI_']
})
