// Wires up clickable IP cells in the Request Logs table. Clicking any element
// with a `data-ip` attribute opens the #ipLookupModal, fetches /admin/ip-lookup,
// and renders the result. Vanilla DOM + Bootstrap 5 (loaded by the layout).

(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Render the ipinfo payload as a definition list of the fields we care about.
  function renderPayload(data) {
    var fields = [
      ['IP', data.ip],
      ['Hostname', data.hostname],
      ['City', data.city],
      ['Region', data.region],
      ['Country', data.country],
      ['Postal', data.postal],
      ['Location', data.loc],
      ['Organization', data.org],
      ['Timezone', data.timezone],
    ];

    var rows = fields
      .filter(function (pair) { return pair[1]; })
      .map(function (pair) {
        return (
          '<dt class="col-sm-4 text-body-secondary fw-normal">' + escapeHtml(pair[0]) + '</dt>' +
          '<dd class="col-sm-8 mb-2">' + escapeHtml(pair[1]) + '</dd>'
        );
      })
      .join('');

    if (!rows) {
      return '<p class="mb-0 text-body-secondary">No information returned.</p>';
    }
    return '<dl class="row mb-0">' + rows + '</dl>';
  }

  function setBody(body, html) {
    body.innerHTML = html;
  }

  function renderLoading(body) {
    setBody(body,
      '<div class="text-center py-4">' +
        '<div class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>' +
        '<span>Looking up…</span>' +
      '</div>'
    );
  }

  function renderError(body, message) {
    setBody(body,
      '<div class="alert alert-warning mb-0">' + escapeHtml(message) + '</div>'
    );
  }

  document.addEventListener('DOMContentLoaded', function () {
    var modalEl = document.getElementById('ipLookupModal');
    if (!modalEl) return;
    var titleEl = modalEl.querySelector('.modal-title');
    var bodyEl = modalEl.querySelector('.modal-body');
    if (!titleEl || !bodyEl) return;

    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Delegated click — any element carrying [data-ip] opens the modal.
    document.addEventListener('click', function (event) {
      var target = event.target.closest('[data-ip]');
      if (!target) return;
      event.preventDefault();

      var ip = target.getAttribute('data-ip');
      if (!ip) return;

      titleEl.textContent = 'IP Address: ' + ip;
      renderLoading(bodyEl);
      modal.show();

      fetch('/admin/ip-lookup?ip=' + encodeURIComponent(ip), {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
      })
        .then(function (response) {
          return response.json().then(function (payload) {
            return { ok: response.ok, payload: payload };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            renderError(bodyEl, (result.payload && result.payload.error) || 'Lookup failed.');
            return;
          }
          setBody(bodyEl, renderPayload(result.payload));
        })
        .catch(function () {
          renderError(bodyEl, 'Network error — could not reach the lookup endpoint.');
        });
    });
  });
})();
