// vite.config.js - Vite設定ファイル
//
// 現在はCDN + Babel Standaloneで動作しているため、
// Vite移行時にこの設定を使用する。
// 移行手順:
//   1. npm install を実行
//   2. src/ 内のファイルをES Modulesに変換（window.XXX → export）
//   3. npm run dev で開発サーバーを起動

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
