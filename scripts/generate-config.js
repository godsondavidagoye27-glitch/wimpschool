const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const envPath = path.join(cwd, '.env');
const envExamplePath = path.join(cwd, '.env.example');
let env = '';
if (fs.existsSync(envPath)) {
  env = fs.readFileSync(envPath, 'utf8');
} else if (fs.existsSync(envExamplePath)) {
  console.warn('.env not found. Using .env.example as fallback for js/config.js generation. Copy .env.example to .env and update your values.');
  env = fs.readFileSync(envExamplePath, 'utf8');
} else {
  console.warn('.env and .env.example not found. Generating empty config placeholder.');
}
function get(key) {
  const m = env.match(new RegExp('^' + key + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
}
const supabaseUrl = get('SUPABASE_URL');
const supabaseKey = get('SUPABASE_ANON_KEY');
const flutterKey = get('FLUTTERWAVE_PUBLIC_KEY');
const out = `// This file is generated from .env. Do not commit secrets to source control.
const wimpSchoolConfig = {
  "supabaseUrl": ${JSON.stringify(supabaseUrl)},
  "supabaseKey": ${JSON.stringify(supabaseKey)},
  "flutterwavePublicKey": ${JSON.stringify(flutterKey)}
};
window.wimpSchoolConfig = window.wimpSchoolConfig || wimpSchoolConfig;
(function () {
  const config = window.wimpSchoolConfig || {};
  const supabaseValid = Boolean(config.supabaseUrl && config.supabaseKey);
  if (!supabaseValid) {
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.padding = '16px';
    banner.style.background = '#e63a2e';
    banner.style.color = '#fff';
    banner.style.zIndex = '9999';
    banner.style.fontFamily = 'sans-serif';
    banner.style.textAlign = 'center';
    banner.textContent = 'WimpSchool configuration failed to load. Please copy .env.example to .env and run node scripts/generate-config.js.';
    document.body?.prepend(banner);
    return;
  }

  const paymentsPage = document.getElementById('payButton') || document.body.dataset.page === 'parent-portal' || document.body.dataset.page === 'fee-management';
  if (paymentsPage && !config.flutterwavePublicKey) {
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.padding = '16px';
    banner.style.background = '#e63a2e';
    banner.style.color = '#fff';
    banner.style.zIndex = '9999';
    banner.style.fontFamily = 'sans-serif';
    banner.style.textAlign = 'center';
    banner.textContent = 'Payment configuration is incomplete. Add FLUTTERWAVE_PUBLIC_KEY to .env and run node scripts/generate-config.js.';
    document.body?.prepend(banner);
  }
})();`;
const outPath = path.join(cwd, 'js', 'config.js');
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', outPath);
