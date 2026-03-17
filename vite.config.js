import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // 1. 原本的網頁路徑設定（保留它，GitHub Pages 才不會白屏）
  base: '/time-block/',

  // 2. 加入 React 插件支援
  plugins: [react()],

  // 3. 加入測試設定 (Vitest)
  test: {
    environment: 'jsdom', // 模擬瀏覽器環境，解決 document/localStorage is not defined
    globals: true,        // 讓測試檔案可以使用 describe, it 等全域變數
  },
})