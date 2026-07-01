function paymentsShowMessage(text, type = 'info') {
  if (typeof window !== 'undefined' && typeof window.showMessage === 'function') {
    return window.showMessage(text, type);
  }

  if (!text) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showPaymentSupportBanner(message) {
  if (typeof window !== 'undefined' && typeof window.showSupportBanner === 'function') {
    window.showSupportBanner(message || 'Need help with this payment? Contact support with your transaction reference.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const payButton = document.getElementById('payButton');
  if (!payButton) return;

  payButton.addEventListener('click', async () => {
    if (!wimpSchoolConfig.flutterwavePublicKey || wimpSchoolConfig.flutterwavePublicKey.includes('<YOUR_')) {
      paymentsShowMessage('Configure your Flutterwave public key in js/config.js before processing payments.', 'error');
      showPaymentSupportBanner('Payment setup is incomplete. Please contact support so we can help you complete the checkout.');
      return;
    }

    try {
      await loadFlutterwaveScript();
      await initializeFlutterwavePayment(payButton);
    } catch (error) {
      console.error('Payment initialization failed:', error);
      paymentsShowMessage('Unable to initialize payment. Please try again later.', 'error');
      showPaymentSupportBanner('We could not start the payment flow. Please contact support if the issue continues.');
    }
  });
});

function loadFlutterwaveScript() {
  return new Promise((resolve, reject) => {
    if (window.FlutterwaveCheckout) {
      return resolve();
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load the Flutterwave checkout script.'));
    document.body.appendChild(script);
  });
}

async function initializeFlutterwavePayment(payButton) {
  const session = await supabase.auth.getSession();
  const amountText = document.getElementById('balanceAmount')?.textContent || '0';
  const amount = Number(amountText.replace(/[^0-9.-]/g, '')) || 0;
  const transactionReference = `WIMP-${Date.now()}`;
  const email = session?.data?.session?.user?.email || 'parent@example.com';
  const childName = document.getElementById('childName')?.textContent || 'Parent';
  const childSelector = document.getElementById('childSelector');
  const selectedStudentId = childSelector?.value || payButton.dataset.studentId || null;

  window.FlutterwaveCheckout({
    public_key: wimpSchoolConfig.flutterwavePublicKey,
    tx_ref: transactionReference,
    amount,
    currency: 'NGN',
    country: 'NG',
    payment_options: 'card,ussd,banktransfer',
    customer: {
      email,
      phonenumber: payButton.dataset.parentId || '',
      name: childName
    },
    customizations: {
      title: 'WimpSchool fee payment',
      description: 'School fee payment for your child',
      logo: `${window.location.origin}/icons/icon-192x192.png`
    },
    callback: function(response) {
      const statusLabel = document.getElementById('paymentStatus');
      if (response.status === 'successful') {
        void (async () => {
          const txRef = response.transaction_id || response.tx_ref || transactionReference;
          let result;
          try {
            result = await recordPayment({
              studentId: selectedStudentId || payButton.dataset.studentId || null,
              parentId: payButton.dataset.parentId || null,
              schoolId: payButton.dataset.schoolId || null,
              amount,
              status: 'paid',
              method: 'flutterwave',
              txRef,
              description: `School fee payment for ${childName}`
            });
          } catch (paymentError) {
            console.error('Payment record failed:', paymentError);
            result = { error: paymentError };
          }

          if (statusLabel) {
            statusLabel.textContent = result?.error
              ? 'Payment was recorded with a warning. Please refresh or contact support if the portal does not update.'
              : 'Payment successful. Updating your portal now...';
          }

          if (result?.error) {
            showPaymentSupportBanner('We hit a problem while finalizing this payment. Contact support with your transaction reference if the portal does not refresh.');
          }

          if (!result?.error && typeof window.refreshParentPortalData === 'function') {
            await window.refreshParentPortalData();
          }

          if (statusLabel && !result?.error) {
            statusLabel.textContent = 'Payment successful. Your portal is updated.';
          }
        })();
        paymentsShowMessage('Payment successful. Thank you!', 'success');
      } else {
        if (statusLabel) {
          statusLabel.textContent = 'Payment was not completed. Please try again. If you already paid, contact the school support team with your transaction reference.';
        }
        paymentsShowMessage('Payment was not completed. Please try again. If funds were deducted, contact support.', 'error');
        showPaymentSupportBanner('Your payment did not complete. Contact support if funds were deducted or if you need help retrying.');
      }
    },
    onclose: function() {
      console.log('Flutterwave checkout closed.');
    }
  });
}
