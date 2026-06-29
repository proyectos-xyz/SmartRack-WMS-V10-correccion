import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
  },
  resolve: {
    alias: {
      stream: 'stream-browserify',
      buffer: 'buffer',
      events: 'events',
      util: 'rollup-plugin-node-polyfills/polyfills/util',
    },
  },
  base: './', // CRITICO: Esto hace que las rutas de los archivos sean relativas y evita la pantalla en blanco
  server: {
    host: true,
    port: 3000,
    strictPort: true
  }
})