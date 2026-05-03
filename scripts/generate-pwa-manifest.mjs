import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const viteManifestPath = path.join(distDir, '.vite', 'manifest.json');
const outputPath = path.join(distDir, 'pwa-precache-manifest.json');

if (!fs.existsSync(viteManifestPath)) {
  throw new Error(`Vite manifest not found at ${viteManifestPath}`);
}

const viteManifest = JSON.parse(fs.readFileSync(viteManifestPath, 'utf8'));
const assets = new Set([
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/sw.js'
]);

for (const entry of Object.values(viteManifest)) {
  if (!entry || typeof entry !== 'object') {
    continue;
  }

  if (typeof entry.file === 'string') {
    assets.add(`/${entry.file}`);
  }

  if (Array.isArray(entry.css)) {
    for (const cssFile of entry.css) {
      assets.add(`/${cssFile}`);
    }
  }

  if (Array.isArray(entry.assets)) {
    for (const asset of entry.assets) {
      assets.add(`/${asset}`);
    }
  }
}

const manifest = {
  version: Date.now(),
  assets: [...assets].sort()
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
