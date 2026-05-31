// Wires up clickable email cells in the admin area. Clicking any element with
// a `data-email` attribute opens #emailLookupModal, fetches /admin/email-lookup
// (Apollo.io People Match), and renders whatever the enrichment returns.
// Vanilla DOM + Bootstrap 5 (loaded by the layout).

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

  // A <dt>/<dd> pair; `valueHtml` is already-escaped/built markup. Empty values
  // are dropped by the caller via filtering.
  function fieldRow(label, valueHtml) {
    if (!valueHtml) return '';
    return (
      '<dt class="col-sm-4 text-body-secondary fw-normal">' + escapeHtml(label) + '</dt>' +
      '<dd class="col-sm-8 mb-2">' + valueHtml + '</dd>'
    );
  }

  function text(value) {
    return value || value === 0 ? escapeHtml(String(value)) : '';
  }

  function link(url, label) {
    if (!url) return '';
    return (
      '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(label || url) +
      '</a>'
    );
  }

  function joinParts(parts) {
    return parts.filter(Boolean).join(', ');
  }

  function dl(rows) {
    var body = rows.filter(Boolean).join('');
    return body ? '<dl class="row mb-0">' + body + '</dl>' : '';
  }

  function renderPersonHeader(person) {
    var name = person.name ||
      joinParts([person.first_name, person.last_name]).replace(/,\s*/g, ' ').trim() ||
      'Unknown';
    var subtitle = person.headline || person.title || '';
    var photo = person.photo_url
      ? '<img src="' + escapeHtml(person.photo_url) + '" alt="" width="56" height="56" ' +
          'class="rounded-circle me-3 flex-shrink-0" style="object-fit: cover;">'
      : '';
    return (
      '<div class="d-flex align-items-center mb-3">' + photo +
        '<div>' +
          '<div class="fw-semibold fs-5">' + escapeHtml(name) + '</div>' +
          (subtitle ? '<div class="small text-body-secondary">' + escapeHtml(subtitle) + '</div>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function renderPersonFields(person) {
    var emailValue = text(person.email);
    if (emailValue && person.email_status) {
      emailValue += ' <span class="badge text-bg-light text-body-secondary">' +
        escapeHtml(person.email_status) + '</span>';
    }
    var departments = Array.isArray(person.departments) ? person.departments.join(', ') : '';
    var location = joinParts([person.city, person.state, person.country]);

    return dl([
      fieldRow('Email', emailValue),
      fieldRow('Title', text(person.title)),
      fieldRow('Seniority', text(person.seniority)),
      fieldRow('Departments', text(departments)),
      fieldRow('Location', text(location)),
      fieldRow('LinkedIn', link(person.linkedin_url, 'View profile')),
      fieldRow('Twitter', link(person.twitter_url, person.twitter_url)),
      fieldRow('GitHub', link(person.github_url, person.github_url)),
      fieldRow('Facebook', link(person.facebook_url, person.facebook_url)),
    ]);
  }

  function renderOrganization(org) {
    if (!org) return '';
    var location = joinParts([org.city, org.state, org.country]);
    var employees = org.estimated_num_employees != null
      ? Number(org.estimated_num_employees).toLocaleString()
      : '';
    var rows = dl([
      fieldRow('Name', org.website_url ? link(org.website_url, org.name) : text(org.name)),
      fieldRow('Industry', text(org.industry)),
      fieldRow('Employees', text(employees)),
      fieldRow('Founded', text(org.founded_year)),
      fieldRow('Domain', text(org.primary_domain)),
      fieldRow('LinkedIn', link(org.linkedin_url, 'View company')),
      fieldRow('Phone', text(org.phone || org.sanitized_phone)),
      fieldRow('Location', text(location)),
    ]);
    if (!rows) return '';
    return (
      '<hr class="my-3">' +
      '<h6 class="text-body-secondary text-uppercase small mb-2">Organization</h6>' +
      rows
    );
  }

  function formatEmploymentDate(value) {
    if (!value) return '';
    // Apollo returns ISO-ish dates; keep just the year-month for compactness.
    return String(value).slice(0, 7);
  }

  function renderEmployment(history) {
    if (!Array.isArray(history) || !history.length) return '';
    var items = history.slice(0, 6).map(function (job) {
      var title = job.title || 'Role';
      var org = job.organization_name ? ' · ' + job.organization_name : '';
      var start = formatEmploymentDate(job.start_date);
      var end = job.current ? 'present' : formatEmploymentDate(job.end_date);
      var range = (start || end) ? ' (' + joinParts([start, end].filter(Boolean)).replace(', ', ' – ') + ')' : '';
      return '<li class="mb-1">' + escapeHtml(title + org) + '<span class="text-body-secondary">' + escapeHtml(range) + '</span></li>';
    }).join('');
    return (
      '<hr class="my-3">' +
      '<h6 class="text-body-secondary text-uppercase small mb-2">Employment history</h6>' +
      '<ul class="list-unstyled small mb-0">' + items + '</ul>'
    );
  }

  function renderResult(person) {
    if (!person) {
      return '<p class="mb-0 text-body-secondary">No Apollo match found for this email.</p>';
    }
    return (
      renderPersonHeader(person) +
      renderPersonFields(person) +
      renderOrganization(person.organization) +
      renderEmployment(person.employment_history)
    );
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

  document.addEventListener('DOMContentLoaded', function () {
    var modalEl = document.getElementById('emailLookupModal');
    if (!modalEl) return;
    var titleEl = modalEl.querySelector('.modal-title');
    var bodyEl = modalEl.querySelector('.modal-body');
    if (!titleEl || !bodyEl) return;

    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-email]');
      // Don't re-open the modal when clicking inside the modal itself.
      if (!trigger || modalEl.contains(trigger)) return;
      event.preventDefault();

      var email = trigger.getAttribute('data-email');
      if (!email) return;

      titleEl.textContent = 'Email Address: ' + email;
      bodyEl.innerHTML = loadingMarkup();
      modal.show();

      fetch('/admin/email-lookup?email=' + encodeURIComponent(email), {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
        .then(function (response) {
          return response.json().then(function (payload) {
            return { ok: response.ok, payload: payload };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            bodyEl.innerHTML = errorMarkup((result.payload && result.payload.error) || 'Lookup failed.');
            return;
          }
          bodyEl.innerHTML = renderResult(result.payload && result.payload.person);
        })
        .catch(function () {
          bodyEl.innerHTML = errorMarkup('Network error — could not reach the lookup endpoint.');
        });
    });
  });
})();
