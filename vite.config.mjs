import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vendor libraries in their own chunks (they change rarely, so they stay cached across updates); dialogs load on demand.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-xterm', test: /node_modules[\/]@xterm/, priority: 30 },
            { name: 'vendor-flow', test: /node_modules[\/]@xyflow/, priority: 30 },
            { name: 'vendor-radix', test: /node_modules[\/]@radix-ui/, priority: 20 },
            { name: 'vendor-react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/, priority: 20 },
          ],
        },
      },
    },
  },
})
