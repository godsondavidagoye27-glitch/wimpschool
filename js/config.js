// This file is generated from .env. Do not commit secrets to source control.
const wimpSchoolConfig = {
  "supabaseUrl": "https://xskvubmylvcxxykowzxb.supabase.co",
  "supabaseKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhza3Z1Ym15bHZjeHh5a293enhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTAxNjEsImV4cCI6MjA5NDUyNjE2MX0.rvh1P0RnFTb_Sd8-uP8AcGdXZITuvXmLAlx4hRMVSXA",
  "flutterwavePublicKey": ""
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
})();