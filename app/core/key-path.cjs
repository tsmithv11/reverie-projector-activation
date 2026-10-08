const fs = require('node:fs');
const path = require('node:path');

function resolveKeyPath({ packaged, runtime, appPath, testMode = false }) {
  const stored = path.join(runtime, '.env');
  if (testMode) return stored;
  if (!packaged) return path.resolve(appPath, '.env');
  if (fs.existsSync(stored)) return stored;
  // A build still inside this repository can use the documented project .env.
  // A distributed app has no source checkout and uses its private settings folder.
  const root = path.resolve(appPath, '../../../../../..');
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (manifest.name === 'reverie-projector' && appPath.startsWith(path.join(root, 'release') + path.sep) && fs.existsSync(path.join(root, '.env'))) return path.join(root, '.env');
  } catch {}
  return stored;
}
module.exports = { resolveKeyPath };
