import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

// Only the shared home UI is rendered. No game controllers, workers or AI run here.
const outDir = '.prerender.local';
await build({
  configFile: false,
  plugins: [react()],
  build: {
    ssr: 'src/entry-prerender.tsx',
    outDir,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'home.mjs' } },
  },
});
const { render } = await import(pathToFileURL(resolve(outDir, 'home.mjs')).href);
const file = resolve('dist/index.html');
const html = await readFile(file, 'utf8');
const marker = '<!--prerender-home-->';
if (!html.includes(marker)) throw new Error('Missing home prerender placeholder');
await writeFile(file, html.replace(marker, render()));
console.log('Prerendered the existing home screen into dist/index.html');
