import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import autoprefixer from 'autoprefixer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    hmr: {
      overlay: false
    }
  },
  // Force clear cache by adding a unique timestamp
  cacheDir: '.vite-cache-' + Date.now(),
  css: {
    postcss: {
      plugins: [
        autoprefixer
      ]
    }
  }
})
