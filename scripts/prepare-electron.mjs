// Step 2 of the desktop pipeline:  vite build  ->  prepare electron/dist  ->  electron-builder  ->  NSIS installer
// Copies the finished web build (dist/) to electron/dist/, which the desktop shell serves and electron-builder packs.
// Page images (electron/pages/1.webp ... 604.webp + boxes.json) are optional: without them the build still works
// and the app simply has no page-image feature.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'dist');
const target = join(root, 'electron', 'dist');
const pages = join(root, 'electron', 'pages');

if (!existsSync(join(source, 'index.html'))) {
  console.error('dist/index.html is missing: run "npm run build" first (or use "npm run dist:win").');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
// the desktop app reads its files directly: it needs no service worker
cpSync(source, target, { recursive: true, filter: (file) => !file.endsWith('sw.js') });
console.log('electron/dist ready');

// the folder must exist for electron-builder (extraResources), even when it is empty
mkdirSync(pages, { recursive: true });
const count = readdirSync(pages).filter((name) => /^\d+\.webp$/.test(name)).length;
console.log(count > 0 ? `page images: ${count}` : 'No page images in electron/pages: the page-image feature will be off (this is not an error).');
