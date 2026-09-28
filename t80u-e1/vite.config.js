import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 构建为单个自包含的 index.html（three.js 与样式全部内联），
// 可直接双击打开，也可部署到任意静态托管（GitHub Pages 等）。
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
  server: { host: true },
});
