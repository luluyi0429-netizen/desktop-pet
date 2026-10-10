const fs = require('node:fs');
const path = require('node:path');
const {normalizeSpeech}=require('./speech-policy.cjs');
const DEFAULTS = Object.freeze({ height: 300, walking: true, muted: false, ...normalizeSpeech() });
function normalize(value) {
  return {
    height: value && Number.isFinite(value.height) ? Math.round(Math.max(150, Math.min(600, value.height))) : DEFAULTS.height,
    walking: value && typeof value.walking === 'boolean' ? value.walking : DEFAULTS.walking,
    muted: value && typeof value.muted === 'boolean' ? value.muted : DEFAULTS.muted,
    ...normalizeSpeech(value || {})
  };
}
function createPreferences(directory) {
  const file = path.join(directory, 'settings.json');
  return {
    read() {
      try { return normalize(JSON.parse(fs.readFileSync(file, 'utf8'))); }
      catch (error) { return { ...DEFAULTS }; }
    },
    write(value) {
      fs.mkdirSync(directory, { recursive: true });
      const temporary = file + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(normalize(value), null, 2), 'utf8');
      fs.renameSync(temporary, file);
    }
  };
}
module.exports = { createPreferences, normalize };
