/**
 * Membership payment page — drives a Stripe Card Element and confirms the
 * PaymentIntent in the browser. Loaded as an external script so the site's
 * `script-src 'self'` CSP holds (Stripe.js itself is allowlisted separately).
 */
(function () {
  'use strict';

  var form = document.getElementById('payment-form');
  if (!form || typeof Stripe === 'undefined') {
    return;
  }

  var clientSecret = form.dataset.clientSecret;
  var stripe = Stripe(form.dataset.stripePk);
  var elements = stripe.elements();

  var card = elements.create('card', {
    style: {
      base: { fontSize: '16px', color: '#3d3d4e', '::placeholder': { color: '#9a9aae' } },
      invalid: { color: '#dc3545' },
    },
  });
  card.mount('#card-element');

  var errorBox = document.getElementById('card-errors');
  var submitButton = document.getElementById('pay-submit');
  var submitLabel = submitButton.textContent;

  // Surface inline validation errors as the user types.
  card.on('change', function (event) {
    errorBox.textContent = event.error ? event.error.message : '';
  });

  function setBusy(busy) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? 'Processing…' : submitLabel;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorBox.textContent = '';
    setBusy(true);

    stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: card },
    }).then(function (result) {
      if (result.error) {
        errorBox.textContent = result.error.message || 'Your payment could not be processed.';
        setBusy(false);
        return;
      }
      if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
        window.location.assign('/pay/success?payment_intent=' + result.paymentIntent.id);
        return;
      }
      errorBox.textContent = 'Payment did not complete. Please try again.';
      setBusy(false);
    }).catch(function () {
      errorBox.textContent = 'Something went wrong. Please try again.';
      setBusy(false);
    });
  });
})();
