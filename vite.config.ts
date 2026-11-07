import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH lets the same build run at the domain root or under /simple-forever-plan/ on GitHub Pages.
export default defineConfig({
  plugins: [
    react(),
    // The speech engine (~21 MB .wasm) loads from jsDelivr at runtime; don't ship a copy with the app.
    { name: 'skip-ort-wasm', generateBundle(_, bundle) { for (const k of Object.keys(bundle)) if (k.endsWith('.wasm')) delete bundle[k] } },
  ],
  base: process.env.BASE_PATH ?? '/',
  // SINGLE_FILE=1 bundles everything into one script (used for the in-chat preview).
  build: process.env.SINGLE_FILE ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {},
})
