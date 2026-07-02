/**
 * Ensure desktop packaging always ships a complete React renderer.
 * Stale dist/win-unpacked can leave a partial resources/renderer (black screen).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(__dirname, '..');
const buildRoot = path.join(desktopRoot, '..', 'build');
const distRoot = path.join(desktopRoot, 'dist');
const unpackedRoot = path.join(distRoot, 'win-unpacked');
const rendererIndex = path.join(buildRoot, 'index.html');
const rendererStatic = path.join(buildRoot, 'static');

function rm(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

if (!fs.existsSync(rendererIndex)) {
  console.error('[SSC desktop] Missing frontend build output:', rendererIndex);
  console.error('[SSC desktop] Run: yarn build:desktop (from frontend/) first.');
  process.exit(1);
}
if (!fs.existsSync(rendererStatic)) {
  console.error('[SSC desktop] Missing frontend static bundle:', rendererStatic);
  process.exit(1);
}

rm(unpackedRoot);
console.log('[SSC desktop] Cleared stale dist/win-unpacked before packaging');