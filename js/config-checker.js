function wimpSchoolRenderConfigError(message) {
  const existing = document.getElementById('wimpschool-config-error');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'wimpschool-config-error';
  banner.style.position = 'fixed';
  banner.style.top = '0';
  banner.style.left = '0';
  banner.style.right = '0';
  banner.style.background = '#e63a2e';
  banner.style.color = '#fff';
  banner.style.padding = '16px';
  banner.style.fontFamily = 'sans-serif';
  banner.style.fontSize = '0.95rem';
  banner.style.textAlign = 'center';
  banner.style.zIndex = '99999';
  banner.textContent = message;
  document.body?.prepend(banner);
}

function wimpSchoolValidateConfig() {
  const valid = window.wimpSchoolConfig
    && typeof window.wimpSchoolConfig.supabaseUrl === 'string'
    && window.wimpSchoolConfig.supabaseUrl.trim()
    && typeof window.wimpSchoolConfig.supabaseKey === 'string'
    && window.wimpSchoolConfig.supabaseKey.trim()
    && typeof window.wimpSchoolConfig.flutterwavePublicKey === 'string'
    && window.wimpSchoolConfig.flutterwavePublicKey.trim();

  if (!valid) {
    wimpSchoolRenderConfigError('WimpSchool failed to load configuration. Copy .env.example to .env and run node scripts/generate-config.js.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(wimpSchoolValidateConfig, 100);
});
