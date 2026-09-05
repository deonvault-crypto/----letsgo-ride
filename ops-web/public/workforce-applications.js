(() => {
  'use strict';

  const ACTIONABLE = new Set(['SUBMITTED', 'UNDER_REVIEW']);
  let applications = [];
  let activeFilter = 'action';

  function isAdmin() {
    return state?.me?.ops_role === 'admin';
  }

  function statusLabel(value) {
    return String(value || 'unknown').replaceAll('_', ' ').toLowerCase();
  }

  function documentLabel(value) {
    return ({
      identity_document: 'Identity document',
      selfie: 'Selfie',
      driver_licence: 'Driver licence',
      vehicle_registration: 'Vehicle registration',
      business_registration: 'Business registration',
    })[value] || statusLabel(value);
  }

  function ensureView() {
    let view = document.getElementById('workforceView');
    if (view) return view;
    view = document.createElement('section');
    view.id = 'workforceView';
    view.className = 'view';
    view.hidden = true;
    const content = document.querySelector('.content');
    content?.appendChild(view);
    return view;
  }

  function ensureDialog() {
    let dialog = document.getElementById('workforceApplicationDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'workforceApplicationDialog';
    dialog.className = 'modal ops-v2-dialog verification-workspace-dialog workforce-application-dialog';
    dialog.innerHTML = '<form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form><div class="ops-v2-dialog-body"></div>';
    document.body.appendChild(dialog);
    return dialog;
  }

  function ensureNavigation() {
    const nav = document.getElementById('nav');
    if (!nav || !isAdmin()) return;
    let button = document.getElementById('workforceApplicationsNav');
    if (button) return;
    button = document.createElement('button');
    button.id = 'workforceApplicationsNav';
    button.dataset.view = 'workforce';
    button.innerHTML = '<span>Worker applications</span><span id="workforceBadge" class="nav-badge attention-badge" hidden></span>';
    const verification = document.getElementById('verificationNav');
    if (verification) verification.insertAdjacentElement('afterend', button);
    else nav.appendChild(button);
  }

  function updateBadge() {
    const badgeNode = document.getElementById('workforceBadge');
    if (!badgeNode) return;
    const count = applications.filter(item => ACTIONABLE.has(String(item.status || '').toUpperCase())).length;
    const hidden = count === 0;
    const text = count ? String(count) : '';
    if (badgeNode.hidden !== hidden) badgeNode.hidden = hidden;
    if (badgeNode.textContent !== text) badgeNode.textContent = text;
  }

  function filterRows() {
    if (activeFilter === 'all') return applications;
    if (activeFilter === 'action') return applications.filter(item => ACTIONABLE.has(String(item.status || '').toUpperCase()));
    return applications.filter(item => String(item.status || '').toUpperCase() === activeFilter);
  }

  function applicationCard(item) {
    const missing = item.missing_document_types || [];
    const documents = item.documents || [];
    const name = item.business_name || item.full_name || 'Applicant';
    return `
      <article class="workforce-card" data-workforce-application="${esc(item.id)}">
        <div class="workforce-card-top">
          <div class="workforce-identity">
            <span class="workforce-product">${esc(String(item.product || 'worker').toUpperCase())}</span>
            <strong>${esc(name)}</strong>
            <span>${esc(item.full_name || '')}${item.phone ? ` · ${esc(item.phone)}` : ''}</span>
          </div>
          <div>${badge(String(item.status || 'unknown').toLowerCase())}</div>
        </div>
        <div class="workforce-meta">
          <span>${esc(item.service_area || 'Service area not set')}</span>
          ${item.vehicle ? `<span>${esc(item.vehicle)}</span>` : ''}
          <span>${documents.length} document${documents.length === 1 ? '' : 's'}</span>
          ${missing.length ? `<span class="workforce-missing">${missing.length} missing</span>` : '<span>Documents complete</span>'}
        </div>
        ${item.review_note ? `<div class="workforce-review-note">Review note: ${esc(item.review_note)}</div>` : ''}
        <div class="workforce-card-actions">
          <button type="button" class="primary small-btn" data-review-workforce="${esc(item.id)}">Review application</button>
          <span class="muted">Updated ${fmt(item.updated_at || item.submitted_at || item.created_at)}</span>
        </div>
      </article>`;
  }

  function paint() {
    const list = document.getElementById('workforceApplicationsList');
    if (!list) return;
    const rows = filterRows();
    list.innerHTML = rows.length
      ? rows.map(applicationCard).join('')
      : '<div class="empty ops-empty-state"><strong>No applications in this view</strong><span>New Courier, Driver and Merchant submissions will appear here.</span></div>';
    const count = document.getElementById('workforceResultCount');
    if (count) count.textContent = `${rows.length} shown`;
    document.querySelectorAll('[data-workforce-filter]').forEach(button => {
      button.classList.toggle('active', button.dataset.workforceFilter === activeFilter);
    });
    updateBadge();
  }

  async function renderWorkforce() {
    const view = ensureView();
    if (!isAdmin()) {
      view.innerHTML = '<div class="panel"><div class="empty">Administrator access is required.</div></div>';
      return;
    }
    view.innerHTML = `
      <section class="workspace-head">
        <div>
          <p class="eyebrow">Onboarding & workforce</p>
          <h2>Worker applications</h2>
          <p>Review Courier, Driver and Merchant applications, inspect protected documents and make the final onboarding decision from Ops.</p>
        </div>
        <div id="workforceResultCount" class="workspace-count">Loading…</div>
      </section>
      <section class="workspace-panel">
        <div class="workforce-filter-row">
          <button type="button" class="filter-chip active" data-workforce-filter="action">Needs action</button>
          <button type="button" class="filter-chip" data-workforce-filter="SUBMITTED">Submitted</button>
          <button type="button" class="filter-chip" data-workforce-filter="UNDER_REVIEW">Under review</button>
          <button type="button" class="filter-chip" data-workforce-filter="APPROVED">Approved</button>
          <button type="button" class="filter-chip" data-workforce-filter="REJECTED">Rejected</button>
          <button type="button" class="filter-chip" data-workforce-filter="all">All</button>
        </div>
        <div id="workforceApplicationsList" class="workforce-list"><div class="loading-line">Loading worker applications…</div></div>
      </section>`;

    view.querySelector('.workforce-filter-row').onclick = event => {
      const button = event.target.closest('[data-workforce-filter]');
      if (!button) return;
      activeFilter = button.dataset.workforceFilter;
      paint();
    };
    view.querySelector('#workforceApplicationsList').onclick = event => {
      const button = event.target.closest('[data-review-workforce]');
      if (button) void openApplication(button.dataset.reviewWorkforce);
    };

    try {
      applications = await request('/operations/admin/applications');
      if (!Array.isArray(applications)) applications = [];
      applications.sort((a, b) => {
        const actionDelta = Number(ACTIONABLE.has(String(b.status || '').toUpperCase())) - Number(ACTIONABLE.has(String(a.status || '').toUpperCase()));
        if (actionDelta) return actionDelta;
        return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      });
      paint();
    } catch (error) {
      view.querySelector('#workforceApplicationsList').innerHTML = `<div class="error">${esc(error.message)}</div>`;
      toast(error.message, true);
    }
  }

  async function openDocument(applicationId, documentId, button) {
    try {
      button.disabled = true;
      const access = await request(`/operations/admin/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/access`, { method: 'POST' });
      const url = String(access.url || '');
      if (!url.startsWith('/operations/admin/')) throw new Error('The protected document link could not be created.');
      window.open(`/api${url}`, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function recipientForUserId(userId) {
    if (!userId) return null;
    const detail = await request(`/admin/users/${encodeURIComponent(userId)}`);
    const user = detail.user || {};
    if (String(user.id || '') !== String(userId)) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      city: user.city,
      role: user.role,
      status: user.status,
    };
  }

  function openDecision(item, status, parentDialog) {
    const dialog = document.getElementById('actionDialog');
    const body = document.getElementById('actionDialogBody');
    if (!dialog || !body) return;
    const rejecting = status === 'REJECTED';
    const approving = status === 'APPROVED';
    const label = rejecting ? 'Reject application' : approving ? 'Approve application' : 'Begin review';
    body.innerHTML = `
      <h2>${label}</h2>
      <p class="meta">${esc(item.business_name || item.full_name || 'Applicant')} · ${esc(String(item.product || 'worker'))}</p>
      <form id="workforceDecisionForm" class="form-grid">
        ${approving ? '<p class="workforce-decision-warning">Approval grants this account access to the selected LetsGoRide product. Confirm only after reviewing every required document.</p>' : ''}
        <label>${rejecting ? 'Required reason' : 'Review note'}<textarea id="workforceDecisionNote" ${rejecting ? 'required minlength="3"' : ''} placeholder="${rejecting ? 'Tell the applicant what needs to be corrected.' : 'Optional internal review note'}"></textarea></label>
        <button class="${rejecting ? 'danger-btn' : 'primary'}" type="submit">${label}</button>
      </form>`;
    dialog.showModal();
    document.getElementById('workforceDecisionForm').onsubmit = async event => {
      event.preventDefault();
      const note = document.getElementById('workforceDecisionNote').value.trim();
      if (rejecting && !note) return;
      try {
        await request(`/operations/admin/applications/${encodeURIComponent(item.id)}/review`, {
          method: 'POST',
          body: JSON.stringify({ status, note: note || null }),
        });
        dialog.close();
        parentDialog.close();
        toast(status === 'APPROVED' ? 'Worker application approved.' : status === 'REJECTED' ? 'Application rejected with feedback.' : 'Application moved to review.');
        await renderWorkforce();
      } catch (error) {
        toast(error.message, true);
      }
    };
  }

  async function openApplication(applicationId) {
    const item = applications.find(candidate => candidate.id === applicationId);
    if (!item) return;
    const dialog = ensureDialog();
    const body = dialog.querySelector('.ops-v2-dialog-body');
    const documents = item.documents || [];
    const required = item.required_document_types || [];
    const missing = item.missing_document_types || [];

    body.innerHTML = `
      <div class="verification-review-head workforce-review-head">
        <div>
          <p class="eyebrow">Worker application</p>
          <h2>${esc(item.business_name || item.full_name || 'Applicant')}</h2>
          <div class="profile-badges">${badge(String(item.status || 'unknown').toLowerCase())}${badge(String(item.product || 'worker').toLowerCase())}</div>
        </div>
        <div class="verification-review-contact"><span>${esc(item.full_name || '—')}</span><span>${esc(item.phone || '—')}</span><span>${esc(item.service_area || '—')}</span></div>
      </div>

      <div class="workforce-summary-grid">
        <div><span>Product</span><strong>${esc(String(item.product || '—').toUpperCase())}</strong></div>
        <div><span>Applicant</span><strong>${esc(item.full_name || '—')}</strong></div>
        <div><span>Service area</span><strong>${esc(item.service_area || '—')}</strong></div>
        <div><span>Submitted</span><strong>${fmt(item.submitted_at || item.updated_at)}</strong></div>
        ${item.vehicle ? `<div><span>Vehicle</span><strong>${esc(item.vehicle)}</strong></div>` : ''}
        ${item.business_registration_number ? `<div><span>Business registration</span><strong>${esc(item.business_registration_number)}</strong></div>` : ''}
      </div>

      <section class="review-section">
        <div class="profile-section-head"><div><h3>Submitted documents</h3><p>${missing.length ? `${missing.length} required document${missing.length === 1 ? ' is' : 's are'} still missing.` : 'All required document types are attached.'}</p></div><span>${documents.length}/${required.length}</span></div>
        <div class="document-grid">${required.length ? required.map(type => {
          const document = documents.find(candidate => candidate.document_type === type);
          return document ? `
            <article class="document-card">
              <div><strong>${esc(documentLabel(type))}</strong><span>${esc(document.file_name || 'Uploaded document')}</span></div>
              <div class="document-status">${badge(String(document.status || 'pending').toLowerCase())}</div>
              ${document.rejection_reason ? `<p>${esc(document.rejection_reason)}</p>` : ''}
              <button type="button" class="secondary small-btn" data-workforce-document="${esc(document.id)}" ${document.has_file === false ? 'disabled' : ''}>${document.has_file === false ? 'File unavailable' : 'View protected document'}</button>
            </article>` : `
            <article class="document-card workforce-document-missing">
              <div><strong>${esc(documentLabel(type))}</strong><span>Required document missing</span></div>
              <div class="document-status"><span class="badge red">missing</span></div>
            </article>`;
        }).join('') : '<div class="profile-empty">No document requirements recorded.</div>'}</div>
      </section>

      ${item.review_note ? `<section class="review-section"><div class="profile-section-head"><h3>Review note</h3></div><p>${esc(item.review_note)}</p></section>` : ''}

      <section class="review-decision-bar">
        <div><strong>Admin review</strong><span>View the protected documents before changing application access.</span></div>
        <div class="review-decision-actions workforce-decision-actions">
          <button type="button" class="secondary" data-message-workforce>Message applicant</button>
          ${String(item.status).toUpperCase() === 'SUBMITTED' ? '<button type="button" class="secondary" data-workforce-decision="UNDER_REVIEW">Begin review</button>' : ''}
          ${ACTIONABLE.has(String(item.status || '').toUpperCase()) ? `<button type="button" class="danger-outline" data-workforce-decision="REJECTED">Reject</button><button type="button" class="primary" data-workforce-decision="APPROVED" ${missing.length ? 'disabled title="Required documents are missing"' : ''}>Approve</button>` : ''}
        </div>
      </section>`;

    body.querySelectorAll('[data-workforce-document]').forEach(button => {
      button.addEventListener('click', () => void openDocument(item.id, button.dataset.workforceDocument, button));
    });
    body.querySelectorAll('[data-workforce-decision]').forEach(button => {
      button.addEventListener('click', () => {
        const status = button.dataset.workforceDecision;
        dialog.close();
        openDecision(item, status, dialog);
      });
    });
    body.querySelector('[data-message-workforce]')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      try {
        button.disabled = true;
        if (!item.user_id) throw new Error('This worker application is not linked to a LetsGoRide account.');
        const recipient = await recipientForUserId(item.user_id);
        if (!recipient) throw new Error('The linked LetsGoRide account could not be loaded for messaging.');
        dialog.close();
        window.openOpsProactiveSupport?.(recipient, {
          subject: `LetsGoRide ${String(item.product || 'worker')} application`,
          message: `Hi ${item.full_name || recipient.name || 'there'}, we are reviewing your LetsGoRide application and need to confirm some information with you.`,
        });
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
      }
    });

    dialog.showModal();
  }

  function openWorkforceView() {
    if (!isAdmin()) return previousOpenView('overview');
    window.stopCommunicationsRealtime?.();
    state.currentView = 'workforce';
    document.querySelectorAll('.view').forEach(view => { view.hidden = true; });
    document.querySelectorAll('#nav button').forEach(button => button.classList.toggle('active', button.dataset.view === 'workforce'));
    const view = ensureView();
    view.hidden = false;
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'Worker applications';
    return renderWorkforce();
  }

  ensureView();
  ensureDialog();
  ensureNavigation();

  const previousOpenView = window.openView || openView;
  const workforceAwareOpenView = async name => {
    ensureNavigation();
    if (name === 'workforce') return openWorkforceView();
    return previousOpenView(name);
  };
  window.openView = workforceAwareOpenView;
  try { openView = workforceAwareOpenView; } catch {}

  const nav = document.getElementById('nav');
  if (nav) {
    const observer = new MutationObserver(ensureNavigation);
    observer.observe(nav, { childList: true });
  }
})();
