/**
 * Bundles the Express application factory into `dist/server.mjs` for `npm start`
 * (`node server.ts`) so Node 22 runs production builds without requiring tsx at runtime.
 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/server/create-app.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  outfile: 'dist/server.mjs',
  sourcemap: false
})

console.log('Server bundle written to dist/server.mjs')
