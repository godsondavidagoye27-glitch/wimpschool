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
  const config = window.wimpSchoolConfig;
  const supabaseValid = config
    && typeof config.supabaseUrl === 'string'
    && config.supabaseUrl.trim()
    && typeof config.supabaseKey === 'string'
    && config.supabaseKey.trim();

  if (!supabaseValid) {
    wimpSchoolRenderConfigError('WimpSchool failed to load Supabase configuration. Copy .env.example to .env and run node scripts/generate-config.js.');
    return;
  }

  const paymentRequired = document.body.dataset.page === 'parent'
    || document.body.dataset.page === 'parent-portal'
    || document.body.dataset.page === 'fee-management'
    || !!document.getElementById('payButton');

  if (paymentRequired && (!config.flutterwavePublicKey || !config.flutterwavePublicKey.trim())) {
    wimpSchoolRenderConfigError('Payment processing is not configured. Add FLUTTERWAVE_PUBLIC_KEY to .env and run node scripts/generate-config.js.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(wimpSchoolValidateConfig, 100);
});
