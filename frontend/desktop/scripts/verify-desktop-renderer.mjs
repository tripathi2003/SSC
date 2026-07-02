/**
 * Fail the desktop build if packaged renderer is incomplete (prevents black-screen installs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'renderer');
const required = [
  path.join(rendererRoot, 'index.html'),
  path.join(rendererRoot, 'static', 'js'),
];

const missing = required.filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error('[SSC desktop] Packaged renderer is incomplete:');
  for (const p of missing) console.error('  -', p);
  process.exit(1);
}

const jsBundles = fs.readdirSync(path.join(rendererRoot, 'static', 'js')).filter((f) => /^main\.[a-f0-9]+\.js$/.test(f));
if (!jsBundles.length) {
  console.error('[SSC desktop] No main.*.js bundle in packaged renderer');
  process.exit(1);
}

console.log(`[SSC desktop] Renderer OK (${jsBundles[0]})`);