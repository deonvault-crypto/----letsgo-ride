(() => {
  'use strict';

  const existingShowApp = showApp;
  const existingRenderUsers = renderUsers;
  const existingRenderVerifications = renderVerifications;

  const isAdmin = () => state?.me?.ops_role === 'admin';
  const isManagerPlus = () => roleRank(state?.me?.ops_role) >= roleRank('manager');

  const roleLabel = role => ({
    passenger: 'Customer',
    driver: 'Driver',
    courier: 'Courier',
    merchant: 'Merchant',
    admin: 'Admin',
    cs: 'Customer Support',
    manager: 'Manager',
  })[String(role || '').toLowerCase()] || String(role || 'Unknown').replaceAll('_', ' ');

  const statusText = value => String(value || 'unknown').replaceAll('_', ' ');

  function safeCount(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function ensureDialog(id, className = '') {
    let dialog = document.getElementById(id);
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = `modal ops-v2-dialog ${className}`.trim();
    dialog.innerHTML = `<form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form><div class="ops-v2-dialog-body"></div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function configureNavigation() {
    const nav = document.getElementById('nav');
    if (!nav || nav.dataset.v2Ready === 'true') {
      applyRoleVisibility();
      return;
    }
    nav.dataset.v2Ready = 'true';
    nav.innerHTML = `
      <div class="nav-section-label">Operate</div>
      <button data-view="overview" class="active"><span>Command center</span></button>
      <button data-view="live"><span>Trips & deliveries</span></button>
      <button data-view="cases"><span>Cases</span><span id="caseBadge" class="nav-badge" hidden></span></button>

      <div class="nav-section-label">People</div>
      <button data-view="users"><span>People</span></button>
      <button data-view="verifications" id="verificationNav"><span>Driver verification</span><span id="verificationBadge" class="nav-badge attention-badge" hidden></span></button>
      <button data-view="support"><span>Support inbox</span><span id="supportBadge" class="nav-badge attention-badge" hidden></span></button>
      <button data-view="safety"><span>Safety</span><span id="safetyBadge" class="nav-badge attention-badge" hidden></span></button>

      <div class="nav-section-label">Manage</div>
      <button data-view="communications"><span>Communications</span></button>
      <button data-view="staff" id="staffNav"><span>Team & roles</span></button>
      <button data-view="appUpdates" id="appUpdatesNav"><span>App releases</span></button>
      <button data-view="audit" id="auditNav"><span>Audit trail</span></button>`;
    applyRoleVisibility();
    void refreshNavBadges();
  }

  function applyRoleVisibility() {
    const managerPlus = isManagerPlus();
    const staffNav = document.getElementById('staffNav');
    const verificationNav = document.getElementById('verificationNav');
    const auditNav = document.getElementById('auditNav');
    const appUpdatesNav = document.getElementById('appUpdatesNav');
    if (staffNav) staffNav.hidden = !managerPlus;
    if (verificationNav) verificationNav.hidden = !managerPlus;
    if (auditNav) auditNav.hidden = !managerPlus;
    if (appUpdatesNav) appUpdatesNav.hidden = !managerPlus;
  }

  async function refreshNavBadges() {
    if (!state?.token) return;
    try {
      const data = await request('/ops/overview');
      const values = [
        ['caseBadge', data.open_ops_cases],
        ['verificationBadge', data.pending_driver_verifications],
        ['supportBadge', data.open_support_cases],
        ['safetyBadge', data.open_safety_reports],
      ];
      values.forEach(([id, value]) => {
        const node = document.getElementById(id);
        if (!node) return;
        const count = safeCount(value);
        node.hidden = count === 0;
        node.textContent = count ? String(count) : '';
      });
    } catch {
      // Navigation must remain usable if metrics are temporarily unavailable.
    }
  }

  showApp = function showAppV2() {
    existingShowApp();
    document.body.classList.add('ops-control-v2');
    configureNavigation();
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle && state.currentView === 'overview') pageTitle.textContent = 'Command center';
  };

  function personSummaryCard(row) {
    const canManage = isAdmin();
    const verification = row.driver_verification_status || row.verification_status;
    return `
      <article class="person-card" data-person-id="${esc(row.id)}">
        <div class="person-card-main">
          <div class="person-avatar" aria-hidden="true">${esc((row.name || row.email || '?').trim().charAt(0).toUpperCase())}</div>
          <div class="person-copy">
            <div class="person-name-line">
              <strong>${esc(row.name || 'Unnamed account')}</strong>
              ${badge(row.status || 'active')}
            </div>
            <div class="person-contact">${esc(row.email || 'No email')} ${row.phone ? `<span>·</span> ${esc(row.phone)}` : ''}</div>
            <div class="person-meta">
              <span>${esc(roleLabel(row.role))}</span>
              ${row.city ? `<span>${esc(row.city)}</span>` : ''}
              ${row.operations_role ? `<span>Ops: ${esc(roleLabel(row.operations_role))}</span>` : ''}
              ${verification && verification !== 'not_started' ? `<span>Verification: ${esc(statusText(verification))}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="person-card-action">
          ${canManage ? `<button class="secondary small-btn" data-open-person="${esc(row.id)}">Manage</button>` : `<span class="muted">${esc(row.id)}</span>`}
        </div>
      </article>`;
  }

  function peopleList(rows) {
    if (!rows?.length) return '<div class="empty ops-empty-state"><strong>No people found</strong><span>Try another name, email, phone number or role.</span></div>';
    return `<div class="people-list">${rows.map(personSummaryCard).join('')}</div>`;
  }

  async function renderUsersV2() {
    const root = document.getElementById('usersView');
    if (!root) return existingRenderUsers();
    root.innerHTML = `
      <section class="workspace-head">
        <div>
          <p class="eyebrow">Accounts</p>
          <h2>People</h2>
          <p>Find any LetsGoRide account and open one clear workspace for its status, activity, support and safety history.</p>
        </div>
        <div id="peopleResultCount" class="workspace-count">Loading…</div>
      </section>
      <section class="workspace-panel">
        <div class="people-toolbar">
          <label class="search-field"><span>Search</span><input id="userSearch" autocomplete="off" placeholder="Name, email, phone or city"></label>
          <label class="compact-field"><span>Role</span><select id="userRole">
            <option value="">Everyone</option>
            <option value="passenger">Customers</option>
            <option value="driver">Drivers</option>
            <option value="courier">Couriers</option>
            <option value="merchant">Merchants</option>
            <option value="admin">Admins</option>
          </select></label>
        </div>
        <div class="role-filter-row" id="peopleRoleQuickFilters">
          <button type="button" class="filter-chip active" data-role="">All</button>
          <button type="button" class="filter-chip" data-role="passenger">Customers</button>
          <button type="button" class="filter-chip" data-role="driver">Drivers</button>
          <button type="button" class="filter-chip" data-role="courier">Couriers</button>
          <button type="button" class="filter-chip" data-role="merchant">Merchants</button>
          <button type="button" class="filter-chip" data-role="admin">Admins</button>
        </div>
        <div id="usersTable" class="workspace-results"><div class="loading-line">Loading accounts…</div></div>
      </section>`;

    let items = [];
    let loadTimer;
    let loadVersion = 0;

    const load = async () => {
      const version = ++loadVersion;
      const params = new URLSearchParams();
      const search = document.getElementById('userSearch')?.value.trim() || '';
      const role = document.getElementById('userRole')?.value || '';
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      params.set('limit', '200');
      const endpoint = isAdmin() ? '/admin/users' : '/ops/users';
      const data = await request(`${endpoint}?${params}`);
      if (version !== loadVersion) return;
      items = data.items || [];
      const resultNode = document.getElementById('usersTable');
      const countNode = document.getElementById('peopleResultCount');
      if (resultNode) resultNode.innerHTML = peopleList(items);
      if (countNode) countNode.textContent = `${safeCount(data.count ?? items.length)} shown`;
    };

    const scheduleLoad = () => {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => void load().catch(error => {
        const resultNode = document.getElementById('usersTable');
        if (resultNode) resultNode.innerHTML = `<div class="error">${esc(error.message)}</div>`;
        toast(error.message, true);
      }), 220);
    };

    document.getElementById('userSearch').oninput = scheduleLoad;
    document.getElementById('userRole').onchange = () => {
      document.querySelectorAll('#peopleRoleQuickFilters .filter-chip').forEach(button => {
        button.classList.toggle('active', button.dataset.role === document.getElementById('userRole').value);
      });
      scheduleLoad();
    };
    document.getElementById('peopleRoleQuickFilters').onclick = event => {
      const chip = event.target.closest('[data-role]');
      if (!chip) return;
      document.getElementById('userRole').value = chip.dataset.role || '';
      document.querySelectorAll('#peopleRoleQuickFilters .filter-chip').forEach(button => button.classList.toggle('active', button === chip));
      scheduleLoad();
    };
    document.getElementById('usersTable').onclick = event => {
      const button = event.target.closest('[data-open-person]');
      if (button && isAdmin()) void openPersonWorkspace(button.dataset.openPerson);
    };
    await load();
  }

  renderUsers = renderUsersV2;
  window.renderUsers = renderUsersV2;

  function statTile(label, value) {
    return `<div class="profile-stat"><span>${esc(label)}</span><strong>${safeCount(value)}</strong></div>`;
  }

  function activityStack(title, rows, renderRow) {
    return `
      <section class="profile-section">
        <div class="profile-section-head"><h3>${esc(title)}</h3><span>${rows?.length || 0}</span></div>
        <div class="profile-stack">${rows?.length ? rows.map(renderRow).join('') : '<div class="profile-empty">Nothing recorded here.</div>'}</div>
      </section>`;
  }

  async function openPersonWorkspace(userId) {
    const dialog = ensureDialog('personWorkspaceDialog', 'person-workspace-dialog');
    const body = dialog.querySelector('.ops-v2-dialog-body');
    body.innerHTML = '<div class="dialog-loading">Loading account workspace…</div>';
    dialog.showModal();
    try {
      const detail = await request(`/admin/users/${encodeURIComponent(userId)}`);
      const user = detail.user || {};
      const driver = detail.driver || null;
      const rides = detail.rides || [];
      const requests = detail.requests || [];
      const support = detail.support_cases || [];
      const safety = detail.safety_reports || [];
      const verificationStatus = user.driver_verification_status || driver?.verification_status || 'not_started';
      body.innerHTML = `
        <div class="profile-hero">
          <div class="profile-identity">
            <div class="profile-avatar">${esc((user.name || user.email || '?').charAt(0).toUpperCase())}</div>
            <div>
              <p class="eyebrow">Account workspace</p>
              <h2>${esc(user.name || 'Unnamed account')}</h2>
              <div class="profile-badges">${badge(user.role)}${badge(user.status || 'active')}${verificationStatus !== 'not_started' ? badge(verificationStatus) : ''}</div>
            </div>
          </div>
          <div class="profile-primary-actions">
            <button type="button" class="secondary" data-person-case="${esc(user.id)}">Open case</button>
            ${driver?.id ? `<button type="button" class="primary" data-person-verification="${esc(driver.id)}">Open verification</button>` : ''}
          </div>
        </div>

        <div class="profile-contact-grid">
          <div><span>Email</span><strong>${esc(user.email || '—')}</strong></div>
          <div><span>Phone</span><strong>${esc(user.phone || '—')}</strong></div>
          <div><span>City</span><strong>${esc(user.city || '—')}</strong></div>
          <div><span>Account ID</span><strong class="codeish">${esc(user.id || '—')}</strong></div>
        </div>

        <div class="profile-stats">
          ${statTile('Posted rides', user.posted_rides_count)}
          ${statTile('Ride requests', user.ride_requests_count)}
          ${statTile('Confirmed', user.confirmed_bookings_count)}
          ${statTile('Support', user.support_cases_count)}
          ${statTile('Safety', user.safety_reports_count)}
        </div>

        ${driver ? `<section class="profile-section profile-driver-section"><div class="profile-section-head"><h3>Driver profile</h3><span>${esc(statusText(verificationStatus))}</span></div><div class="profile-contact-grid"><div><span>Driver status</span><strong>${esc(driver.status || '—')}</strong></div><div><span>Verification</span><strong>${esc(statusText(verificationStatus))}</strong></div><div><span>Driver ID</span><strong class="codeish">${esc(driver.id || '—')}</strong></div><div><span>Submitted</span><strong>${fmt(driver.verification_submitted_at)}</strong></div></div></section>` : ''}

        <div class="profile-two-column">
          ${activityStack('Recent rides', rides, row => `<div class="profile-record"><div><strong>${esc((row.origin && row.destination) ? `${row.origin} → ${row.destination}` : row.id || 'Ride')}</strong><span>${fmt(row.updated_at || row.created_at)}</span></div>${badge(row.status)}</div>`)}
          ${activityStack('Ride requests', requests, row => `<div class="profile-record"><div><strong>${esc(row.passenger_name || row.id || 'Request')}</strong><span>${fmt(row.updated_at || row.created_at)}</span></div>${badge(row.status)}</div>`)}
          ${activityStack('Support history', support, row => `<div class="profile-record"><div><strong>${esc(row.subject || 'Support request')}</strong><span>${fmt(row.updated_at || row.created_at)}</span></div>${badge(row.status)}</div>`)}
          ${activityStack('Safety history', safety, row => `<div class="profile-record"><div><strong>${esc(row.report_type || 'Safety report')}</strong><span>${fmt(row.updated_at || row.created_at)}</span></div>${badge(row.status)}</div>`)}
        </div>

        <section class="profile-section account-controls">
          <div class="profile-section-head"><div><h3>Admin controls</h3><p>High-impact changes require a reason and are written to the audit trail.</p></div></div>
          <div class="account-control-row">
            ${user.status === 'active' || !user.status ? `<button type="button" class="secondary" data-account-status="suspended">Suspend account</button>` : `<button type="button" class="secondary" data-account-status="active">Restore account</button>`}
            <button type="button" class="secondary" data-account-role>Change product role</button>
            ${user.status !== 'deleted' ? `<button type="button" class="danger-outline" data-account-status="deleted">Mark account deleted</button>` : ''}
          </div>
        </section>`;

      body.querySelector('[data-person-case]')?.addEventListener('click', () => {
        dialog.close();
        openCreateCase({ source_type: 'user', source_id: user.id, subject: `Account support - ${user.name || user.email || user.id}`, description: 'Account requires Operations review.' });
      });
      body.querySelector('[data-person-verification]')?.addEventListener('click', event => {
        dialog.close();
        void openVerificationWorkspace(event.currentTarget.dataset.personVerification);
      });
      body.querySelectorAll('[data-account-status]').forEach(button => {
        button.addEventListener('click', () => openAccountStatusAction(user, button.dataset.accountStatus, dialog));
      });
      body.querySelector('[data-account-role]')?.addEventListener('click', () => openAccountRoleAction(user, dialog));
    } catch (error) {
      body.innerHTML = `<div class="error">${esc(error.message)}</div>`;
    }
  }

  function openAccountStatusAction(user, nextStatus, parentDialog) {
    const actionDialog = document.getElementById('actionDialog');
    const body = document.getElementById('actionDialogBody');
    if (!actionDialog || !body) return;
    const destructive = nextStatus === 'deleted';
    const label = nextStatus === 'active' ? 'Restore account' : nextStatus === 'suspended' ? 'Suspend account' : 'Mark account deleted';
    body.innerHTML = `
      <h2>${esc(label)}</h2>
      <p class="meta">${esc(user.name || user.email || user.id)}</p>
      <form id="personStatusForm" class="form-grid">
        <label>Reason<textarea id="personStatusReason" required minlength="3" placeholder="Why is this account status changing?"></textarea></label>
        ${destructive ? '<p class="error">This is a high-impact account state. Confirm only when the account should no longer operate normally.</p>' : ''}
        <button class="${destructive ? 'danger-btn' : 'primary'}" type="submit">${esc(label)}</button>
      </form>`;
    actionDialog.showModal();
    document.getElementById('personStatusForm').onsubmit = async event => {
      event.preventDefault();
      try {
        const params = new URLSearchParams({ status: nextStatus, reason: document.getElementById('personStatusReason').value.trim() });
        await request(`/admin/users/${encodeURIComponent(user.id)}/status?${params}`, { method: 'PATCH' });
        actionDialog.close();
        parentDialog.close();
        toast('Account status updated.');
        await renderUsersV2();
      } catch (error) { toast(error.message, true); }
    };
  }

  function openAccountRoleAction(user, parentDialog) {
    const actionDialog = document.getElementById('actionDialog');
    const body = document.getElementById('actionDialogBody');
    if (!actionDialog || !body) return;
    body.innerHTML = `
      <h2>Change product role</h2>
      <p class="meta">${esc(user.name || user.email || user.id)}</p>
      <form id="personRoleForm" class="form-grid">
        <label>New role<select id="personProductRole">
          <option value="driver" ${user.role === 'driver' ? 'selected' : ''}>Driver</option>
          <option value="courier" ${user.role === 'courier' ? 'selected' : ''}>Courier</option>
          <option value="merchant" ${user.role === 'merchant' ? 'selected' : ''}>Merchant</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select></label>
        <label>Reason<textarea id="personRoleReason" required minlength="3" placeholder="Why does this person need this product role?"></textarea></label>
        <p class="meta">The current protected API provisions operational product roles. It does not expose a passenger downgrade action here.</p>
        <button class="primary" type="submit">Save product role</button>
      </form>`;
    actionDialog.showModal();
    document.getElementById('personRoleForm').onsubmit = async event => {
      event.preventDefault();
      try {
        await request(`/admin/users/${encodeURIComponent(user.id)}/role`, {
          method: 'PATCH',
          body: JSON.stringify({
            role: document.getElementById('personProductRole').value,
            reason: document.getElementById('personRoleReason').value.trim(),
          }),
        });
        actionDialog.close();
        parentDialog.close();
        toast('Product role updated.');
        await renderUsersV2();
      } catch (error) { toast(error.message, true); }
    };
  }

  function verificationNeedsAction(status) {
    return ['pending', 'pending_uploads', 'pending_auto_check', 'needs_review', 'needs_resubmission'].includes(String(status || '').toLowerCase());
  }

  function verificationCard(row, canReview) {
    const flags = [
      ...(row.review_reasons || []),
      ...(row.risk_flags || []),
      ...(row.duplicate_flags || []),
    ].filter(Boolean).slice(0, 3);
    return `
      <article class="verification-card" data-verification-id="${esc(row.driver_id || row.id)}">
        <div class="verification-primary">
          <div>
            <div class="verification-name-line"><strong>${esc(row.name || 'Driver')}</strong>${badge(row.verification_status)}</div>
            <div class="verification-contact">${esc(row.email || row.phone || 'No contact')} ${row.city ? `<span>·</span> ${esc(row.city)}` : ''}</div>
          </div>
          <div class="verification-time"><span>Submitted</span><strong>${fmt(row.verification_submitted_at)}</strong></div>
        </div>
        <div class="verification-meta">
          ${row.document_count !== undefined ? `<span>${safeCount(row.document_count)} documents</span>` : ''}
          ${row.risk_level ? `<span>Risk: ${esc(statusText(row.risk_level))}</span>` : ''}
          ${row.face_match_status ? `<span>Face: ${esc(statusText(row.face_match_status))}</span>` : ''}
          <span>Updated ${fmt(row.updated_at)}</span>
        </div>
        ${flags.length ? `<div class="verification-flags">${flags.map(flag => `<span>${esc(statusText(flag))}</span>`).join('')}</div>` : ''}
        <div class="verification-actions">
          ${canReview ? `<button class="primary small-btn" data-review-verification="${esc(row.driver_id || row.id)}">Review application</button>` : '<span class="muted">Manager view · Admin decision required</span>'}
        </div>
      </article>`;
  }

  async function renderVerificationsV2() {
    const root = document.getElementById('verificationsView');
    if (!root) return existingRenderVerifications();
    const adminMode = isAdmin();
    root.innerHTML = `
      <section class="workspace-head">
        <div>
          <p class="eyebrow">Trust & onboarding</p>
          <h2>Driver verification</h2>
          <p>${adminMode ? 'Review identity and vehicle submissions, open protected documents, then approve, reject or request resubmission.' : 'Review the queue and escalate decisions that require Admin authority.'}</p>
        </div>
        <div id="verificationResultCount" class="workspace-count">Loading…</div>
      </section>
      <section class="workspace-panel">
        <div class="people-toolbar">
          <label class="search-field"><span>Search</span><input id="verificationSearch" autocomplete="off" placeholder="Driver, email, phone or city"></label>
          <label class="compact-field"><span>View</span><select id="verificationFilter"><option value="action">Needs action</option><option value="all">All submissions</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="needs_resubmission">Resubmission</option></select></label>
        </div>
        <div id="verificationStats" class="verification-stats"></div>
        <div id="verificationCards" class="verification-list"><div class="loading-line">Loading verification queue…</div></div>
      </section>`;

    let allItems = [];
    let loadTimer;
    let loadVersion = 0;

    const paint = () => {
      const filter = document.getElementById('verificationFilter')?.value || 'action';
      let rows = allItems;
      if (filter === 'action') rows = rows.filter(row => verificationNeedsAction(row.verification_status));
      else if (filter !== 'all') rows = rows.filter(row => String(row.verification_status || '').toLowerCase() === filter);
      const stats = {
        action: allItems.filter(row => verificationNeedsAction(row.verification_status)).length,
        approved: allItems.filter(row => ['approved', 'active', 'verified'].includes(String(row.verification_status || '').toLowerCase())).length,
        rejected: allItems.filter(row => String(row.verification_status || '').toLowerCase() === 'rejected').length,
      };
      const statNode = document.getElementById('verificationStats');
      if (statNode) statNode.innerHTML = `<button type="button" data-verification-quick="action"><span>Needs action</span><strong>${stats.action}</strong></button><button type="button" data-verification-quick="approved"><span>Approved</span><strong>${stats.approved}</strong></button><button type="button" data-verification-quick="rejected"><span>Rejected</span><strong>${stats.rejected}</strong></button><button type="button" data-verification-quick="all"><span>All</span><strong>${allItems.length}</strong></button>`;
      const listNode = document.getElementById('verificationCards');
      if (listNode) listNode.innerHTML = rows.length ? rows.map(row => verificationCard(row, adminMode)).join('') : '<div class="empty ops-empty-state"><strong>Nothing in this view</strong><span>The queue is clear for this filter.</span></div>';
      const countNode = document.getElementById('verificationResultCount');
      if (countNode) countNode.textContent = `${rows.length} shown`;
    };

    const load = async () => {
      const version = ++loadVersion;
      const search = document.getElementById('verificationSearch')?.value.trim() || '';
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const endpoint = adminMode ? '/admin/verifications' : '/ops/verifications';
      const data = await request(`${endpoint}?${params}`);
      if (version !== loadVersion) return;
      allItems = data.items || [];
      paint();
    };

    document.getElementById('verificationSearch').oninput = () => {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => void load().catch(error => toast(error.message, true)), 220);
    };
    document.getElementById('verificationFilter').onchange = paint;
    document.getElementById('verificationStats').onclick = event => {
      const button = event.target.closest('[data-verification-quick]');
      if (!button) return;
      document.getElementById('verificationFilter').value = button.dataset.verificationQuick;
      paint();
    };
    document.getElementById('verificationCards').onclick = event => {
      const button = event.target.closest('[data-review-verification]');
      if (button && adminMode) void openVerificationWorkspace(button.dataset.reviewVerification);
    };
    await load();
    void refreshNavBadges();
  }

  renderVerifications = renderVerificationsV2;
  window.renderVerifications = renderVerificationsV2;

  function documentTypeLabel(type) {
    return ({
      selfie: 'Selfie',
      identity_document: 'Identity document',
      driver_license: 'Driver licence',
      vehicle_registration_or_logbook: 'Vehicle registration / logbook',
      vehicle_photo_optional: 'Vehicle photo',
    })[type] || statusText(type);
  }

  async function openVerificationWorkspace(driverId) {
    if (!isAdmin()) return;
    const dialog = ensureDialog('verificationWorkspaceDialog', 'verification-workspace-dialog');
    const body = dialog.querySelector('.ops-v2-dialog-body');
    body.innerHTML = '<div class="dialog-loading">Loading verification application…</div>';
    dialog.showModal();
    try {
      const detail = await request(`/admin/verifications/${encodeURIComponent(driverId)}`);
      const driver = detail.driver || {};
      const user = detail.user || {};
      const vehicles = detail.vehicles || [];
      const documents = detail.documents || [];
      body.innerHTML = `
        <div class="verification-review-head">
          <div>
            <p class="eyebrow">Verification review</p>
            <h2>${esc(driver.name || user.name || 'Driver')}</h2>
            <div class="profile-badges">${badge(driver.verification_status)}${badge(driver.status || 'pending')}</div>
          </div>
          <div class="verification-review-contact"><span>${esc(driver.email || user.email || '—')}</span><span>${esc(driver.phone || user.phone || '—')}</span><span>${esc(driver.city || user.city || '—')}</span></div>
        </div>

        <section class="review-section">
          <div class="profile-section-head"><h3>Documents</h3><span>${documents.length}</span></div>
          <div class="document-grid">${documents.length ? documents.map(document => `
            <article class="document-card">
              <div><strong>${esc(documentTypeLabel(document.document_type))}</strong><span>${esc(document.file_name || 'Uploaded document')}</span></div>
              <div class="document-status">${badge(document.status || 'pending')}</div>
              ${document.rejection_reason ? `<p>${esc(document.rejection_reason)}</p>` : ''}
              <button type="button" class="secondary small-btn" data-view-document="${esc(document.id)}" ${document.has_file ? '' : 'disabled'}>${document.has_file ? 'View protected document' : 'File unavailable'}</button>
            </article>`).join('') : '<div class="profile-empty">No verification documents are attached.</div>'}</div>
        </section>

        <section class="review-section">
          <div class="profile-section-head"><h3>Vehicle information</h3><span>${vehicles.length}</span></div>
          <div class="vehicle-grid">${vehicles.length ? vehicles.map(vehicle => `<div class="vehicle-card"><strong>${esc([vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle')}</strong><span>${esc(vehicle.color || 'Color not recorded')}</span><span>${esc(vehicle.plate_number || 'Plate not recorded')}</span></div>`).join('') : '<div class="profile-empty">No vehicle record attached to this driver.</div>'}</div>
        </section>

        ${(driver.review_reasons?.length || driver.risk_flags?.length || driver.duplicate_flags?.length) ? `<section class="review-section risk-section"><div class="profile-section-head"><h3>Review signals</h3></div><div class="verification-flags">${[...(driver.review_reasons || []), ...(driver.risk_flags || []), ...(driver.duplicate_flags || [])].map(item => `<span>${esc(statusText(item))}</span>`).join('')}</div></section>` : ''}

        <section class="review-decision-bar">
          <div><strong>Admin decision</strong><span>Every decision is handled by the protected production verification API.</span></div>
          <div class="review-decision-actions">
            <button type="button" class="secondary" data-verification-decision="needs_resubmission">Request resubmission</button>
            <button type="button" class="danger-outline" data-verification-decision="rejected">Reject</button>
            <button type="button" class="primary" data-verification-decision="approved">Approve driver</button>
          </div>
        </section>`;

      body.querySelectorAll('[data-view-document]').forEach(button => {
        button.addEventListener('click', async () => {
          try {
            button.disabled = true;
            const access = await request(`/admin/verifications/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(button.dataset.viewDocument)}/access`, { method: 'POST' });
            const url = String(access.url || '');
            if (!url.startsWith('/admin/')) throw new Error('The protected document link could not be created.');
            window.open(`/api${url}`, '_blank', 'noopener,noreferrer');
          } catch (error) {
            toast(error.message, true);
          } finally {
            button.disabled = false;
          }
        });
      });
      body.querySelectorAll('[data-verification-decision]').forEach(button => {
        button.addEventListener('click', () => openVerificationDecision(driver, button.dataset.verificationDecision, dialog));
      });
    } catch (error) {
      body.innerHTML = `<div class="error">${esc(error.message)}</div>`;
    }
  }

  function openVerificationDecision(driver, decision, parentDialog) {
    const actionDialog = document.getElementById('actionDialog');
    const body = document.getElementById('actionDialogBody');
    if (!actionDialog || !body) return;
    const labels = {
      approved: 'Approve driver',
      rejected: 'Reject verification',
      needs_resubmission: 'Request resubmission',
    };
    const requiresReason = decision !== 'approved';
    body.innerHTML = `
      <h2>${esc(labels[decision] || 'Verification decision')}</h2>
      <p class="meta">${esc(driver.name || driver.email || driver.id)}</p>
      <form id="verificationDecisionForm" class="form-grid">
        <label>Admin notes<textarea id="verificationDecisionNotes" placeholder="Internal review notes"></textarea></label>
        ${requiresReason ? '<label>Reason<textarea id="verificationDecisionReason" required minlength="3" placeholder="Explain what the driver needs to correct or why the submission is rejected"></textarea></label>' : ''}
        <button class="${decision === 'rejected' ? 'danger-btn' : 'primary'}" type="submit">${esc(labels[decision])}</button>
      </form>`;
    actionDialog.showModal();
    document.getElementById('verificationDecisionForm').onsubmit = async event => {
      event.preventDefault();
      try {
        const payload = {
          status: decision,
          admin_verification_notes: document.getElementById('verificationDecisionNotes').value.trim() || null,
          rejection_reason: requiresReason ? document.getElementById('verificationDecisionReason').value.trim() : null,
          document_id: null,
          document_status: null,
        };
        await request(`/admin/verifications/${encodeURIComponent(driver.id)}/status`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        actionDialog.close();
        parentDialog.close();
        toast(decision === 'approved' ? 'Driver approved.' : decision === 'rejected' ? 'Verification rejected.' : 'Resubmission requested.');
        await renderVerificationsV2();
        void refreshNavBadges();
      } catch (error) { toast(error.message, true); }
    };
  }

  function improveExistingViews() {
    const titleMap = {
      overview: 'Command center',
      live: 'Trips & deliveries',
      cases: 'Case management',
      support: 'Support inbox',
      communications: 'Communications',
      appUpdates: 'App releases',
      users: 'People',
      safety: 'Safety',
      verifications: 'Driver verification',
      staff: 'Team & roles',
      audit: 'Audit trail',
    };
    Object.assign(TITLES, titleMap);
  }

  improveExistingViews();
  configureNavigation();
  ensureDialog('personWorkspaceDialog', 'person-workspace-dialog');
  ensureDialog('verificationWorkspaceDialog', 'verification-workspace-dialog');

  const originalOpenView = openView;
  openView = async function openViewV2(name) {
    const result = await originalOpenView(name);
    configureNavigation();
    await refreshNavBadges();
    return result;
  };
  window.openView = openView;

  if (state?.token && !document.getElementById('appView')?.hidden) {
    document.body.classList.add('ops-control-v2');
    configureNavigation();
    setTimeout(() => void openView(state.currentView || 'overview'), 0);
  }
})();
