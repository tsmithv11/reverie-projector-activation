const fs = require('node:fs');
const { parse } = require('dotenv');
const KEY_NAMES = { decart: 'DECART_API_KEY', fal: 'FAL_KEY' };
function readKeys(file, env = process.env) {
  let saved = {}; try { saved = parse(fs.readFileSync(file)); } catch {}
  return Object.fromEntries(Object.entries(KEY_NAMES).map(([provider, name]) => [provider, (env[name] || saved[name] || '').trim()]));
}
function saveKey(file, provider, value) {
  const name = KEY_NAMES[provider];
  if (!name || typeof value !== 'string' || value.length > 512 || /[\r\n"'\\]/.test(value)) throw Error('Invalid key');
  let content = ''; try { content = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Change only this entry: the other provider key and comments must survive.
  const entry = new RegExp(`^(?:export\\s+)?${name}\\s*=.*(?:\\r?\\n|$)`, 'gm');
  content = content.replace(entry, '');
  if (content && !content.endsWith('\n')) content += '\n';
  fs.writeFileSync(file, `${content}${name}=${value.trim()}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return value.trim();
}
module.exports = { readKeys, saveKey };
