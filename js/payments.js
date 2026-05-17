document.addEventListener('DOMContentLoaded', () => {
  const payButton = document.getElementById('payButton');
  if (!payButton) return;

  payButton.addEventListener('click', async () => {
    if (!wimpSchoolConfig.flutterwavePublicKey || wimpSchoolConfig.flutterwavePublicKey.includes('<YOUR_')) {
      alert('Configure your Flutterwave public key in js/config.js before processing payments.');
      return;
    }

    try {
      await loadFlutterwaveScript();
      await initializeFlutterwavePayment(payButton);
    } catch (error) {
      console.error('Payment initialization failed:', error);
      alert('Unable to initialize payment. Please try again later.');
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
      name: document.getElementById('childName')?.textContent || 'Parent'
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
          await recordPayment({
            studentId: payButton.dataset.studentId || null,
            parentId: payButton.dataset.parentId || null,
            schoolId: payButton.dataset.schoolId || null,
            amount,
            status: 'paid',
            method: 'flutterwave',
            txRef
          });
        })();
        if (statusLabel) {
          statusLabel.textContent = 'Payment successful. Thank you!';
        }
        alert('Payment successful. Thank you!');
      } else {
        if (statusLabel) {
          statusLabel.textContent = 'Payment was not completed. Please try again.';
        }
        alert('Payment was not completed. Please try again.');
      }
    },
    onclose: function() {
      console.log('Flutterwave checkout closed.');
    }
  });
}
