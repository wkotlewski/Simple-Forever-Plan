import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH lets the same build run at the domain root or under /simple-forever-plan/ on GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
})
