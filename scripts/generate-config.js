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

let env = {};
const requiredKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'FLUTTERWAVE_PUBLIC_KEY'];

if (fs.existsSync(envPath)) {
  env = parseEnv(fs.readFileSync(envPath, 'utf8'));
} else {
  console.warn('.env file not found. Falling back to environment variables.');
}

for (const key of requiredKeys) {
  if (!env[key] && process.env[key]) {
    env[key] = process.env[key];
  }
}

const missing = requiredKeys.filter(key => !env[key] || !env[key].trim());

if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  console.error('Copy .env.example to .env and fill the missing values before running node scripts/generate-config.js.');
  process.exit(1);
}

const config = {
  supabaseUrl: env.SUPABASE_URL,
  supabaseKey: env.SUPABASE_ANON_KEY,
  flutterwavePublicKey: env.FLUTTERWAVE_PUBLIC_KEY
};

const out = `// This file is generated from .env. Do not commit secrets to source control.\n` +
`const wimpSchoolConfig = ${JSON.stringify(config, null, 2)};\n` +
`window.wimpSchoolConfig = window.wimpSchoolConfig || wimpSchoolConfig;\n` +
`(function () {\n` +
`  const isValid = Boolean(window.wimpSchoolConfig && window.wimpSchoolConfig.supabaseUrl && window.wimpSchoolConfig.supabaseKey && window.wimpSchoolConfig.flutterwavePublicKey);\n` +
`  if (!isValid) {\n` +
`    const banner = document.createElement('div');\n` +
`    banner.style.position = 'fixed';\n` +
`    banner.style.top = '0';\n` +
`    banner.style.left = '0';\n` +
`    banner.style.right = '0';\n` +
`    banner.style.padding = '16px';\n` +
`    banner.style.background = '#e63a2e';\n` +
`    banner.style.color = '#fff';\n` +
`    banner.style.zIndex = '9999';\n` +
`    banner.style.fontFamily = 'sans-serif';\n` +
`    banner.style.textAlign = 'center';\n` +
`    banner.textContent = 'WimpSchool configuration failed to load. Please copy .env.example to .env and run node scripts/generate-config.js.';\n` +
`    document.body?.prepend(banner);\n` +
`  }\n` +
`})();\n`;

fs.writeFileSync(outPath, out, { encoding: 'utf8' });
console.log('Generated', outPath);
