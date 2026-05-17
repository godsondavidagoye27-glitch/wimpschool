const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const outPath = path.join(__dirname, '..', 'js', 'config.js');

function parseEnv(content) {
  const lines = content.split(/\r?\n/);
  const obj = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    obj[key] = val;
  }
  return obj;
}

if (!fs.existsSync(envPath)) {
  console.error('.env file not found. Copy .env.example to .env and fill values.');
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));

const config = {
  supabaseUrl: env.SUPABASE_URL || '',
  supabaseKey: env.SUPABASE_ANON_KEY || '',
  flutterwavePublicKey: env.FLUTTERWAVE_PUBLIC_KEY || '',
  superAdminSecret: env.SUPER_ADMIN_SECRET || ''
};

const out = `// This file is generated from .env. Do not commit secrets to source control.\n` +
`const wimpSchoolConfig = ${JSON.stringify(config, null, 2)};\n` +
`window.wimpSchoolConfig = window.wimpSchoolConfig || wimpSchoolConfig;\n`;

fs.writeFileSync(outPath, out, { encoding: 'utf8' });
console.log('Generated', outPath);
