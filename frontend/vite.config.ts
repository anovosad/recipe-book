import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  // Tailwind is a real build step now. It used to be loaded from
  // cdn.tailwindcss.com at runtime, which meant the whole stylesheet in
  // src/styles was inert: the CDN only scans the live DOM, so every @apply
  // in that file was emitted verbatim and ignored by the browser.
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      // import.meta.dirname, not __dirname: Vite 8 loads this config natively
      // (as ESM) rather than pre-bundling it, so the CJS globals are gone.
      '@': path.resolve(import.meta.dirname, './src'),
    }
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Vite 8 bundles with Rolldown, which dropped the object form of
        // `manualChunks` in favour of `codeSplitting.groups`. Groups are tried
        // in order and the first match wins, so the react-* libraries have to be
        // listed before the `react` group itself would swallow them.
        codeSplitting: {
          groups: [
            { name: 'vendor-router', test: /[\\/]node_modules[\\/]react-router(-dom)?[\\/]/ },
            { name: 'vendor-forms', test: /[\\/]node_modules[\\/]react-hook-form[\\/]/ },
            { name: 'vendor-ui', test: /[\\/]node_modules[\\/](lucide-react|react-hot-toast|goober)[\\/]/ },
            { name: 'vendor-http', test: /[\\/]node_modules[\\/](axios|follow-redirects)[\\/]/ },
            { name: 'vendor-state', test: /[\\/]node_modules[\\/]zustand[\\/]/ },
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ]
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Enable compression and minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.logs in production
        drop_debugger: true
      }
    },
    // Reduce chunk size warning limit
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
