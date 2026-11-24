// Vite dev only: serve the Mushaf page images directly from electron/pages.
// The desktop build and the production web build keep using qpage://pages/...;
// that protocol only exists inside the Electron shell, so the dev server needs
// a small HTTP bridge for the page-image feature to be testable in a browser.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = join(root, 'electron', 'pages');
const PREFIX = '/__pages/';

export default function devPagesPlugin() {
  return {
    name: 'quran-dev-pages',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = String(req.url || '').split('?')[0];
        if (!pathname.startsWith(PREFIX)) {
          next();
          return;
        }

        const name = pathname.slice(PREFIX.length);
        if (name !== 'boxes.json' && !/^\d{1,3}\.webp$/u.test(name)) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }

        const file = join(pagesDir, name);
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }

        res.setHeader('Content-Type', name.endsWith('.json') ? 'application/json; charset=utf-8' : 'image/webp');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
  };
}
