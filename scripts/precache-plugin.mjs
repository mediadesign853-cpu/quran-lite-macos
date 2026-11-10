// Vite plugin: fill the service worker's application cache name and precache file list.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** List files relative to a directory, always using "/" separators. */
function listFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`]
  );
}

const shortHash = (hash) => hash.digest('hex').slice(0, 10);

export default function precachePlugin() {
  let outDir = '';
  return {
    name: 'quran-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const skip = new Set(['sw.js', '_headers', 'data/NOTICE.txt']);
      const files = listFiles(outDir).filter((file) => !skip.has(file) && !file.endsWith('.map')).sort();
      const appHash = createHash('sha256');
      for (const file of files) appHash.update(file).update(readFileSync(join(outDir, file)));

      const swPath = join(outDir, 'sw.js');
      let sw = readFileSync(swPath, 'utf8');
      const fill = (token, value) => {
        if (!sw.includes(token)) throw new Error(`public/sw.js has no ${token} to fill in`);
        sw = sw.replace(token, () => value);
      };
      fill("'__PRECACHE_NAME__'", JSON.stringify(`quran-reader-app-${shortHash(appHash)}`));
      fill('__PRECACHE_URLS__', JSON.stringify(files));
      writeFileSync(swPath, sw);
      console.log(`precache: ${files.length} application files`);
    },
  };
}
