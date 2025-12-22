import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  plugins: [vue()],
  server: {
    hmr: {
      overlay: false
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'leaflet': ['leaflet'],
          'd3': ['d3'],
          'suncalc': ['suncalc']
        }
      }
    }
  },
  css: {
    postcss: {
      plugins: [
        autoprefixer
      ]
    }
  }
})
