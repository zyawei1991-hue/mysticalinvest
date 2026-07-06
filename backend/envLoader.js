const fs = require('fs');
const path = require('path');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return null;
  const index = trimmed.indexOf('=');
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function loadEnv(envPath) {
  const filePath = envPath || path.join(__dirname, '../.env');
  if (!fs.existsSync(filePath)) return false;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach(line => {
    const parsed = parseEnvLine(line);
    if (!parsed) return;
    if (process.env[parsed.key] === undefined) process.env[parsed.key] = parsed.value;
  });
  return true;
}

module.exports = { loadEnv };
