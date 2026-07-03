/** Remove hosting installers from public/downloads before mobile/desktop React builds. */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', 'downloads');
if (!fs.existsSync(dir)) process.exit(0);

for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
  if (ent.name === '.gitkeep') continue;
  fs.rmSync(path.join(dir, ent.name), { recursive: true, force: true });
}