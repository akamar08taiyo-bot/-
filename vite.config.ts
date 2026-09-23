import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        // 健康管理アプリ（既存）
        main: path.resolve(__dirname, 'index.html'),
        // 住宅ローン 金利シナリオ・シミュレーター
        mortgage: path.resolve(__dirname, 'mortgage.html'),
      },
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
