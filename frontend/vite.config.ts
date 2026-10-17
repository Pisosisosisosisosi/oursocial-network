import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // Отключаем использование eval внутри минификатора (например, esbuild по умолчанию может его задействовать в некоторых режимах)
    minify: 'esbuild',
    target: 'esnext',
})
