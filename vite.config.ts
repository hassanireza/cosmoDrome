import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites from /<repo-name>/, so the base path
// must match the repository name. Override with VITE_BASE for local
// builds or a custom domain deploy.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/cosmodrome/',
})
