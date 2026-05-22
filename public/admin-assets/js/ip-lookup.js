// Wires up clickable IP cells in the admin area. Clicking any element with a
// `data-ip` attribute opens #ipLookupModal, fetches /admin/ip-lookup, and also
// surfaces Ban/Unban controls (depending on `data-banned`). Vanilla DOM +
// Bootstrap 5 (loaded by the layout).

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

  function renderInfoSection(data) {
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

  function renderBanControls(ip, isBanned) {
    if (isBanned) {
      return (
        '<div class="alert alert-danger d-flex align-items-center justify-content-between mb-0">' +
          '<div><strong>This IP is banned.</strong> Future requests are rejected with 403.</div>' +
          '<button type="button" class="btn btn-sm btn-outline-light js-unban-ip" data-ip="' + escapeHtml(ip) + '">Unban</button>' +
        '</div>'
      );
    }
    return (
      '<form class="js-ban-form" data-ip="' + escapeHtml(ip) + '">' +
        '<label class="form-label small text-body-secondary mb-1" for="banReasonInput">Reason (optional)</label>' +
        '<div class="d-flex gap-2">' +
          '<input type="text" class="form-control form-control-sm" id="banReasonInput" maxlength="500" placeholder="Why are you banning this IP?">' +
          '<button type="submit" class="btn btn-sm btn-danger flex-shrink-0">Ban IP</button>' +
        '</div>' +
      '</form>'
    );
  }

  function renderModal(bodyEl, ip, isBanned, infoHtml) {
    bodyEl.innerHTML =
      '<h6 class="text-body-secondary text-uppercase small mb-2">Geolocation</h6>' +
      '<div class="js-info-section mb-3">' + infoHtml + '</div>' +
      '<hr class="my-3">' +
      '<h6 class="text-body-secondary text-uppercase small mb-2">Ban</h6>' +
      '<div class="js-ban-section">' + renderBanControls(ip, isBanned) + '</div>';
  }

  function loadingMarkup() {
    return (
      '<div class="text-center py-3">' +
        '<div class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>' +
        '<span>Looking up…</span>' +
      '</div>'
    );
  }

  function errorMarkup(message) {
    return '<div class="alert alert-warning mb-0">' + escapeHtml(message) + '</div>';
  }

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    }).then(function (response) {
      return response.json().then(function (payload) {
        return { ok: response.ok, payload: payload };
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var modalEl = document.getElementById('ipLookupModal');
    if (!modalEl) return;
    var titleEl = modalEl.querySelector('.modal-title');
    var bodyEl = modalEl.querySelector('.modal-body');
    if (!titleEl || !bodyEl) return;

    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-ip]');
      // Don't re-open the modal when clicking inside the modal itself.
      if (!trigger || modalEl.contains(trigger)) return;
      event.preventDefault();

      var ip = trigger.getAttribute('data-ip');
      if (!ip) return;
      var isBanned = trigger.getAttribute('data-banned') === '1';

      titleEl.textContent = 'IP Address: ' + ip;
      renderModal(bodyEl, ip, isBanned, loadingMarkup());
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
          var infoSection = bodyEl.querySelector('.js-info-section');
          if (!infoSection) return;
          if (!result.ok) {
            infoSection.innerHTML = errorMarkup((result.payload && result.payload.error) || 'Lookup failed.');
            return;
          }
          infoSection.innerHTML = renderInfoSection(result.payload);
        })
        .catch(function () {
          var infoSection = bodyEl.querySelector('.js-info-section');
          if (infoSection) {
            infoSection.innerHTML = errorMarkup('Network error — could not reach the lookup endpoint.');
          }
        });
    });

    // Ban form submit (inside the modal).
    bodyEl.addEventListener('submit', function (event) {
      var form = event.target.closest('.js-ban-form');
      if (!form) return;
      event.preventDefault();

      var ip = form.getAttribute('data-ip');
      var reasonInput = form.querySelector('input');
      var reason = reasonInput ? reasonInput.value.trim() : '';
      var submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      postJson('/admin/banned-ips', { ip: ip, reason: reason })
        .then(function (result) {
          if (!result.ok) {
            alert((result.payload && result.payload.error) || 'Ban failed.');
            if (submitButton) submitButton.disabled = false;
            return;
          }
          // Refresh so the row badge and listing reflect the new ban.
          window.location.reload();
        })
        .catch(function () {
          alert('Network error — could not reach the ban endpoint.');
          if (submitButton) submitButton.disabled = false;
        });
    });

    // Unban button click (inside the modal).
    bodyEl.addEventListener('click', function (event) {
      var button = event.target.closest('.js-unban-ip');
      if (!button) return;
      event.preventDefault();

      var ip = button.getAttribute('data-ip');
      button.disabled = true;

      postJson('/admin/banned-ips/unban', { ip: ip })
        .then(function (result) {
          if (!result.ok) {
            alert((result.payload && result.payload.error) || 'Unban failed.');
            button.disabled = false;
            return;
          }
          window.location.reload();
        })
        .catch(function () {
          alert('Network error — could not reach the unban endpoint.');
          button.disabled = false;
        });
    });
  });
})();
