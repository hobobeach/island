(function () {
  var form = document.getElementById('invite-form');
  if (!form) return;

  var formSection = document.getElementById('invite-form-section');
  var success = document.getElementById('invite-success');
  var successEmail = document.getElementById('invite-success-email');
  var errorBox = document.getElementById('invite-error');
  var submit = document.getElementById('invite-submit');
  var defaultSubmitLabel = submit.textContent;

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    errorBox.hidden = true;
    errorBox.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Sending…';

    var email = form.email.value.trim();
    var data = {
      fullName: form.fullName.value.trim(),
      email: email,
    };

    try {
      var response = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      var body = await response.json().catch(function () { return {}; });

      if (!response.ok) {
        throw new Error(body.message || 'Something went wrong. Please try again.');
      }

      successEmail.textContent = email;
      formSection.hidden = true;
      success.hidden = false;
      success.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      errorBox.textContent = error.message || 'Something went wrong. Please try again.';
      errorBox.hidden = false;
      submit.disabled = false;
      submit.textContent = defaultSubmitLabel;
    }
  });
})();
