import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * `base` is the one thing that changes between running this locally and serving
 * it from GitHub Pages.
 *
 * A dev server and a production build off `main` both live at the root, so base
 * stays "/" for them and `npm run dev` opens at http://localhost:5173 exactly
 * as the README says. But Pages serves a project site from a subdirectory —
 * https://<user>.github.io/solar-explorer/ — and every asset URL the app builds
 * is `import.meta.env.BASE_URL + 'models/…'`, so without the prefix each one
 * would resolve to /models/… at the domain root and 404. The deploy workflow
 * sets DEPLOY_BASE to '/solar-explorer/'; nothing else needs to know.
 */
export default defineConfig(() => ({
  base: process.env.DEPLOY_BASE || '/',
  plugins: [react()],
  server: { port: 5173, open: false },
}))
