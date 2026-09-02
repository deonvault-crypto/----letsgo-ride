const API = '/api';
const state = {
  token: sessionStorage.getItem('lgr_ops_token') || '',
  me: null,
  currentView: 'overview',
  staff: [],
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const roleRank = role => ({ cs: 10, manager: 20, admin: 30 })[role] || 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function unwrap(body) {
  if (!body?.success) throw new Error(body?.error || 'Request failed.');
  return body.data;
}

async function request(path, options = {}, includeToken = true) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(includeToken && state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${API}${path}`, { ...options, headers });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status}).`);
  return unwrap(body);
}

function toast(message, bad = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('bad', bad);
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 3200);
}

function fmt(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString(); } catch { return esc(value); }
}

function badge(value) {
  const normalized = String(value || 'unknown').toLowerCase();
  let tone = 'gray';
  if (['active', 'approved', 'resolved', 'completed', 'delivered', 'online'].includes(normalized)) tone = 'green';
  else if (['pending', 'pending_uploads', 'needs_review', 'in_review', 'waiting_customer', 'manager'].includes(normalized)) tone = 'amber';
  else if (['rejected', 'cancelled', 'suspended', 'deleted', 'urgent', 'admin'].includes(normalized)) tone = 'red';
  else if (['open', 'received', 'in_progress', 'searching', 'cs'].includes(normalized)) tone = 'blue';
  return `<span class="badge ${tone}">${esc(normalized.replaceAll('_', ' '))}</span>`;
}

function showLogin(message = '') {
  $('#loginView').hidden = false;
  $('#appView').hidden = true;
  $('#loginError').hidden = !message;
  $('#loginError').textContent = message;
  $('#password').value = '';
}

function showApp() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  const role = state.me?.ops_role;
  $('#staffIdentity').innerHTML = `<strong>${esc(state.me?.name || state.me?.email || 'Staff')}</strong><span>${esc(state.me?.email || '')}</span><span class="role">${esc(role)} · Operations</span>`;
  const managerPlus = roleRank(role) >= roleRank('manager');
  $('#staffNav').hidden = !managerPlus;
  $('#verificationNav').hidden = !managerPlus;
  $('#auditNav').hidden = !managerPlus;
}

async function boot() {
  if (!state.token) return showLogin();
  try {
    state.me = await request('/ops/me');
    showApp();
    await openView('overview');
  } catch (error) {
    sessionStorage.removeItem('lgr_ops_token');
    state.token = '';
    state.me = null;
    showLogin(error.message);
  }
}

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('#loginError').hidden = true;
  $('#loginBtn').disabled = true;
  try {
    const result = await request('/auth/email-login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('#email').value.trim(),
        password: $('#password').value,
      }),
    }, false);
    state.token = result.token;
    sessionStorage.setItem('lgr_ops_token', state.token);
    state.me = await request('/ops/me');
    showApp();
    await openView('overview');
  } catch (error) {
    showLogin(error.message);
  } finally {
    $('#loginBtn').disabled = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try { if (state.token) await request('/auth/logout', { method: 'POST' }); } catch {}
  sessionStorage.removeItem('lgr_ops_token');
  state.token = '';
  state.me = null;
  state.staff = [];
  showLogin();
});

$('#nav').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) openView(button.dataset.view);
});

$('#refreshBtn').addEventListener('click', () => openView(state.currentView));

const TITLES = {
  overview: 'Operations overview',
  live: 'Live operations',
  cases: 'Case management',
  support: 'Customer support',
  users: 'People',
  safety: 'Safety reports',
  verifications: 'Verification queue',
  staff: 'Staff & roles',
  audit: 'Audit trail',
};

async function openView(name) {
  const managerOnly = new Set(['verifications', 'staff', 'audit']);
  if (managerOnly.has(name) && roleRank(state.me?.ops_role) < roleRank('manager')) name = 'overview';
  state.currentView = name;
  $$('.view').forEach(view => { view.hidden = true; });
  $$('#nav button').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  const target = $(`#${name}View`);
  if (!target) return;
  target.hidden = false;
  $('#pageTitle').textContent = TITLES[name] || 'Operations';
  try {
    if (name === 'overview') await renderOverview();
    else if (name === 'live') await renderLive();
    else if (name === 'cases') await renderCases();
    else if (name === 'support') await renderSupport();
    else if (name === 'users') await renderUsers();
    else if (name === 'safety') await renderSafety();
    else if (name === 'verifications') await renderVerifications();
    else if (name === 'staff') await renderStaff();
    else if (name === 'audit') await renderAudit();
  } catch (error) {
    target.innerHTML = `<div class="panel"><div class="empty">${esc(error.message)}</div></div>`;
    toast(error.message, true);
  }
}

function metric(label, value, hint = '') {
  return `<article class="metric"><div class="label">${esc(label)}</div><div class="value">${esc(value ?? 0)}</div>${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</article>`;
}

function caseCards(rows) {
  if (!rows?.length) return '<div class="empty">No operations cases yet.</div>';
  return `<div class="cards">${rows.map(row => `
    <article class="case-card" data-case-id="${esc(row.id)}">
      <div class="case-top"><span class="case-number">${esc(row.case_number || row.id)}</span>${badge(row.priority)}</div>
      <h3>${esc(row.subject || 'Operations case')}</h3>
      <p>${esc((row.description || '').slice(0, 150))}${(row.description || '').length > 150 ? '…' : ''}</p>
      <div class="case-meta">${badge(row.status)}${badge(row.escalation_level)}<span class="badge gray">${esc(row.assigned_name || 'unassigned')}</span></div>
    </article>`).join('')}</div>`;
}

async function renderOverview() {
  const data = await request('/ops/overview');
  $('#caseBadge').hidden = !data.open_ops_cases;
  $('#caseBadge').textContent = data.open_ops_cases || '';
  $('#overviewView').innerHTML = `
    <div class="metrics">
      ${metric('Open ops cases', data.open_ops_cases, 'CS → Manager → Admin')}
      ${metric('Open support', data.open_support_cases, 'Customer messages')}
      ${metric('Active Ride Now', data.active_hailing_trips, 'Live e-hailing trips')}
      ${metric('Active deliveries', data.active_courier_deliveries, 'Courier work')}
      ${metric('Active food orders', data.active_food_orders, 'Food operations')}
      ${metric('Safety reports', data.open_safety_reports, 'Open or under review')}
      ${metric('Pending verification', data.pending_driver_verifications, 'Manager/Admin attention')}
      ${metric('Users', data.total_users, 'All product accounts')}
    </div>
    <div class="panel-grid">
      <section class="panel">
        <div class="panel-head"><div><h2>Recent cases</h2><p>Latest operational work across the team.</p></div><button class="secondary" data-go="cases">Open queue</button></div>
        <div class="panel-body" id="recentCaseCards">${caseCards(data.recent_cases)}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>Escalations</h2><p>Cases waiting above Customer Support.</p></div></div>
        <div class="panel-body"><div class="metrics two-metrics">${metric('Manager', data.manager_escalations)}${metric('Admin', data.admin_escalations)}</div></div>
      </section>
    </div>`;
  $('#overviewView').querySelector('[data-go="cases"]').onclick = () => openView('cases');
  $('#recentCaseCards').onclick = event => {
    const card = event.target.closest('[data-case-id]');
    if (card) openCase(card.dataset.caseId);
  };
}

function liveBlock(title, rows, type) {
  const items = rows?.length ? rows.map(row => {
    const route = row.origin && row.destination
      ? `${row.origin} → ${row.destination}`
      : row.pickup_address && row.dropoff_address
        ? `${row.pickup_address} → ${row.dropoff_address}`
        : row.restaurant_id || row.city_id || row.id;
    return `<div class="live-item"><div class="live-line"><strong>${esc(route || row.id)}</strong>${badge(row.status)}</div><small>${esc(row.id)} · ${fmt(row.updated_at || row.created_at)}</small><button class="link-btn" data-new-case="${esc(type)}" data-source-id="${esc(row.id)}">Open operations case</button></div>`;
  }).join('') : '<div class="empty">Nothing active right now.</div>';
  return `<section class="live-card"><div class="panel-head"><div><h3>${esc(title)}</h3><p>${rows?.length || 0} active records</p></div></div><div class="live-list">${items}</div></section>`;
}

async function renderLive() {
  const data = await request('/ops/live');
  $('#liveView').innerHTML = `<div class="live-grid">${liveBlock('Ride Now', data.hailing, 'hailing_trip')}${liveBlock('Courier deliveries', data.courier, 'courier_delivery')}${liveBlock('Food orders', data.food, 'food_order')}${liveBlock('Shared rides', data.shared_rides, 'shared_ride')}</div>`;
  $('#liveView').onclick = event => {
    const button = event.target.closest('[data-new-case]');
    if (button) openCreateCase({ source_type: button.dataset.newCase, source_id: button.dataset.sourceId });
  };
}

function casesTable(rows) {
  if (!rows?.length) return '<div class="empty">No cases match these filters.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Case</th><th>Priority</th><th>Status</th><th>Level</th><th>Assigned</th><th>Updated</th></tr></thead><tbody>${rows.map(row => `<tr data-case-id="${esc(row.id)}"><td><div class="row-title">${esc(row.subject)}</div><div class="row-sub">${esc(row.case_number || row.id)}</div></td><td>${badge(row.priority)}</td><td>${badge(row.status)}</td><td>${badge(row.escalation_level)}</td><td>${esc(row.assigned_name || 'Unassigned')}</td><td>${fmt(row.updated_at)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderCases() {
  $('#casesView').innerHTML = `<section class="panel"><div class="panel-head"><div><h2>Operations cases</h2><p>One accountable queue with enforced escalation.</p></div><div class="toolbar"><button id="newCaseBtn" class="primary">New case</button></div></div><div class="panel-body"><div class="toolbar"><input id="caseSearch" placeholder="Search case, issue or assignee"><select id="caseLevel"><option value="">All levels</option><option value="cs">CS</option><option value="manager">Manager</option><option value="admin">Admin</option></select><select id="caseStatus"><option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_customer">Waiting customer</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div><div id="casesTable" class="mt-14"></div></div></section>`;
  $('#newCaseBtn').onclick = () => openCreateCase();
  const load = async () => {
    const params = new URLSearchParams();
    if ($('#caseSearch').value.trim()) params.set('search', $('#caseSearch').value.trim());
    if ($('#caseLevel').value) params.set('escalation_level', $('#caseLevel').value);
    if ($('#caseStatus').value) params.set('status', $('#caseStatus').value);
    const data = await request(`/ops/cases?${params}`);
    $('#casesTable').innerHTML = casesTable(data.items);
  };
  let timer;
  $('#caseSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
  $('#caseLevel').onchange = load;
  $('#caseStatus').onchange = load;
  $('#casesTable').onclick = event => {
    const row = event.target.closest('[data-case-id]');
    if (row) openCase(row.dataset.caseId);
  };
  await load();
}

function openCreateCase(seed = {}) {
  $('#actionDialogBody').innerHTML = `<h2>New operations case</h2><p class="meta">Create a trackable case. The initial escalation level is Customer Support.</p><form id="newCaseForm" class="form-grid"><label>Subject<input id="newCaseSubject" required maxlength="180" value="${esc(seed.subject || '')}"></label><label>Description<textarea id="newCaseDescription" required maxlength="5000">${esc(seed.description || '')}</textarea></label><div class="form-row"><label>Priority<select id="newCasePriority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label>Source<select id="newCaseSource"><option value="manual">Manual</option><option value="support_message">Support message</option><option value="safety_report">Safety report</option><option value="shared_ride">Shared ride</option><option value="ride_request">Ride request</option><option value="hailing_trip">Ride Now</option><option value="courier_delivery">Courier delivery</option><option value="food_order">Food order</option><option value="user">User</option></select></label></div><label>Source ID<input id="newCaseSourceId" value="${esc(seed.source_id || '')}" placeholder="Optional for manual cases"></label><button class="primary" type="submit">Create case</button></form>`;
  $('#newCaseSource').value = seed.source_type || 'manual';
  $('#actionDialog').showModal();
  $('#newCaseForm').onsubmit = async event => {
    event.preventDefault();
    try {
      const sourceType = $('#newCaseSource').value;
      const sourceId = $('#newCaseSourceId').value.trim();
      const created = await request('/ops/cases', {
        method: 'POST',
        body: JSON.stringify({
          subject: $('#newCaseSubject').value.trim(),
          description: $('#newCaseDescription').value.trim(),
          priority: $('#newCasePriority').value,
          source_type: sourceType,
          source_id: sourceId || null,
        }),
      });
      $('#actionDialog').close();
      toast('Operations case created.');
      await openCase(created.id);
    } catch (error) { toast(error.message, true); }
  };
}

async function loadStaff() {
  if (roleRank(state.me?.ops_role) < roleRank('manager')) return [];
  const data = await request('/ops/staff');
  state.staff = data.items || [];
  return state.staff;
}

async function openCase(caseId) {
  const detail = await request(`/ops/cases/${encodeURIComponent(caseId)}`);
  const c = detail.case;
  const canWork = roleRank(state.me.ops_role) >= roleRank(c.escalation_level);
  const nextLevel = c.escalation_level === 'cs' ? 'manager' : c.escalation_level === 'manager' ? 'admin' : null;
  let staff = [];
  if (roleRank(state.me.ops_role) >= roleRank('manager')) staff = await loadStaff();
  const eligibleStaff = staff.filter(member => member.enabled && roleRank(member.role) >= roleRank(c.escalation_level));
  const events = detail.events || [];

  $('#caseDialogBody').innerHTML = `<p class="eyebrow">${esc(c.case_number || c.id)}</p><h2>${esc(c.subject)}</h2><p class="meta">${esc(c.source_type)}${c.source_id ? ` · ${esc(c.source_id)}` : ''} · created ${fmt(c.created_at)}</p><div class="case-meta case-summary">${badge(c.priority)}${badge(c.status)}${badge(c.escalation_level)}<span class="badge gray">${esc(c.assigned_name || 'unassigned')}</span></div><div class="flush-panel"><strong>Description</strong><p class="muted">${esc(c.description)}</p></div>${detail.customer ? `<dl class="kv"><dt>Customer</dt><dd>${esc(detail.customer.name || '—')}</dd><dt>Email</dt><dd>${esc(detail.customer.email || '—')}</dd><dt>Phone</dt><dd>${esc(detail.customer.phone || '—')}</dd></dl>` : ''}<h3>Case timeline</h3><div class="timeline">${events.length ? events.map(item => `<div class="timeline-item"><strong>${esc(item.action.replaceAll('_', ' '))}</strong><small>${esc(item.actor_name || 'Staff')} · ${esc(item.actor_ops_role || '')} · ${fmt(item.created_at)}</small>${item.note ? `<p>${esc(item.note)}</p>` : ''}</div>`).join('') : '<div class="muted">No timeline entries yet.</div>'}</div>${canWork ? `<div class="form-grid"><label>Internal note<textarea id="caseNote" placeholder="Add context for the next person who handles this case"></textarea></label><div class="modal-actions"><button id="addCaseNote" class="secondary">Add note</button><button id="assignCase" class="secondary">${state.me.ops_role === 'cs' ? 'Assign to me' : 'Assign case'}</button><button id="statusCase" class="secondary">Change status</button>${nextLevel ? `<button id="escalateCase" class="danger-btn">Escalate to ${esc(nextLevel)}</button>` : ''}</div></div>` : '<p class="error">This case is above your role and is read-only.</p>'}`;
  $('#caseDialog').showModal();
  if (!canWork) return;

  $('#addCaseNote').onclick = async () => {
    const note = $('#caseNote').value.trim();
    if (!note) return toast('Write a note first.', true);
    try {
      await request(`/ops/cases/${encodeURIComponent(caseId)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      toast('Note added.');
      $('#caseDialog').close();
      await openCase(caseId);
    } catch (error) { toast(error.message, true); }
  };

  $('#assignCase').onclick = async () => {
    try {
      if (state.me.ops_role === 'cs') {
        await request(`/ops/cases/${encodeURIComponent(caseId)}/assign`, {
          method: 'PATCH',
          body: JSON.stringify({ assigned_user_id: state.me.id }),
        });
        toast('Case assigned.');
        $('#caseDialog').close();
        await openCase(caseId);
      } else {
        if (!eligibleStaff.length) return toast('No eligible staff member is available for this level.', true);
        $('#caseDialog').close();
        openAssignmentDialog(caseId, eligibleStaff);
      }
    } catch (error) { toast(error.message, true); }
  };

  $('#statusCase').onclick = () => {
    $('#caseDialog').close();
    openStatusDialog(caseId, c.status);
  };
  if ($('#escalateCase')) $('#escalateCase').onclick = () => {
    $('#caseDialog').close();
    openEscalationDialog(caseId, nextLevel);
  };
}

function openAssignmentDialog(caseId, staff) {
  $('#actionDialogBody').innerHTML = `<h2>Assign case</h2><form id="assignForm" class="form-grid"><label>Staff member<select id="assignUser"><option value="">Unassigned</option>${staff.map(member => `<option value="${esc(member.user_id)}">${esc(member.name || member.email)} · ${esc(member.role)}</option>`).join('')}</select></label><button class="primary" type="submit">Save assignment</button></form>`;
  $('#actionDialog').showModal();
  $('#assignForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await request(`/ops/cases/${encodeURIComponent(caseId)}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_user_id: $('#assignUser').value || null }),
      });
      $('#actionDialog').close();
      toast('Assignment updated.');
      await openCase(caseId);
    } catch (error) { toast(error.message, true); }
  };
}

function openStatusDialog(caseId, currentStatus) {
  const statuses = ['open', 'in_progress', 'waiting_customer', 'resolved', ...(roleRank(state.me.ops_role) >= roleRank('manager') ? ['closed'] : [])];
  $('#actionDialogBody').innerHTML = `<h2>Change case status</h2><form id="statusForm" class="form-grid"><label>Status<select id="newStatus">${statuses.map(status => `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${status.replaceAll('_', ' ')}</option>`).join('')}</select></label><label>Note<textarea id="statusNote" placeholder="Optional explanation"></textarea></label><button class="primary" type="submit">Update status</button></form>`;
  $('#actionDialog').showModal();
  $('#statusForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await request(`/ops/cases/${encodeURIComponent(caseId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: $('#newStatus').value, note: $('#statusNote').value.trim() || null }),
      });
      $('#actionDialog').close();
      toast('Case status updated.');
      await openCase(caseId);
    } catch (error) { toast(error.message, true); }
  };
}

function openEscalationDialog(caseId, nextLevel) {
  $('#actionDialogBody').innerHTML = `<h2>Escalate to ${esc(nextLevel)}</h2><p class="meta">This removes the current assignment and moves the case exactly one level upward.</p><form id="escalateForm" class="form-grid"><label>Reason<textarea id="escalateReason" required placeholder="Why could this level not resolve the case?"></textarea></label><button class="danger-btn" type="submit">Confirm escalation</button></form>`;
  $('#actionDialog').showModal();
  $('#escalateForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await request(`/ops/cases/${encodeURIComponent(caseId)}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason: $('#escalateReason').value.trim() }),
      });
      $('#actionDialog').close();
      toast(`Case escalated to ${nextLevel}.`);
      await openView('cases');
    } catch (error) { toast(error.message, true); }
  };
}

function supportTable(rows) {
  if (!rows.length) return '<div class="empty">No support messages found.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Issue</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${rows.map(row => `<tr><td><div class="row-title">${esc(row.user_name || 'User')}</div><div class="row-sub">${esc(row.user_email || row.user_phone || '')}</div></td><td><div class="row-title">${esc(row.subject || 'Support request')}</div><div class="row-sub">${esc((row.message || '').slice(0, 100))}</div></td><td>${badge(row.status)}</td><td>${fmt(row.updated_at || row.created_at)}</td><td><button class="secondary small-btn" data-support-action="${esc(row.id)}">Handle</button> <button class="link-btn" data-support-case="${esc(row.id)}">Open case</button></td></tr>`).join('')}</tbody></table></div>`;
}

async function renderSupport() {
  let currentItems = [];
  $('#supportView').innerHTML = `<section class="panel"><div class="panel-head"><div><h2>Customer support queue</h2><p>Replies here notify the customer in the app.</p></div><div class="toolbar"><input id="supportSearch" placeholder="Search support"><select id="supportStatus"><option value="">All statuses</option><option value="received">Received</option><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div></div><div id="supportTable"></div></section>`;
  const load = async () => {
    const params = new URLSearchParams();
    if ($('#supportSearch').value.trim()) params.set('search', $('#supportSearch').value.trim());
    if ($('#supportStatus').value) params.set('status', $('#supportStatus').value);
    const next = await request(`/ops/support/messages?${params}`);
    currentItems = next.items || [];
    $('#supportTable').innerHTML = supportTable(currentItems);
  };
  let timer;
  $('#supportSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
  $('#supportStatus').onchange = load;
  $('#supportTable').onclick = event => {
    const action = event.target.closest('[data-support-action]');
    const makeCase = event.target.closest('[data-support-case]');
    const id = action?.dataset.supportAction || makeCase?.dataset.supportCase;
    const row = currentItems.find(item => item.id === id);
    if (!row) return;
    if (action) openSupportAction(row);
    if (makeCase) openCreateCase({
      source_type: 'support_message',
      source_id: row.id,
      subject: row.subject || 'Customer support case',
      description: row.message || 'Support request',
    });
  };
  await load();
}

function openSupportAction(row) {
  $('#actionDialogBody').innerHTML = `<h2>Handle support message</h2><p class="meta">${esc(row.user_name || row.user_email || 'Customer')}</p><p>${esc(row.message || '')}</p><form id="supportActionForm" class="form-grid"><label>Status<select id="supportActionStatus">${['received', 'open', 'in_review', 'resolved', 'closed'].map(status => `<option value="${status}" ${row.status === status ? 'selected' : ''}>${status.replaceAll('_', ' ')}</option>`).join('')}</select></label><label>Reply<textarea id="supportReply" placeholder="Optional reply shown through the support workflow"></textarea></label><button class="primary" type="submit">Save & notify</button></form>`;
  $('#actionDialog').showModal();
  $('#supportActionForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await request(`/ops/support/messages/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: $('#supportActionStatus').value,
          reply: $('#supportReply').value.trim() || null,
        }),
      });
      $('#actionDialog').close();
      toast('Support message updated.');
      await renderSupport();
    } catch (error) { toast(error.message, true); }
  };
}

function usersTable(rows) {
  if (!rows.length) return '<div class="empty">No people found.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Product role</th><th>Ops role</th><th>Status</th><th>ID</th></tr></thead><tbody>${rows.map(row => `<tr><td><div class="row-title">${esc(row.name || '—')}</div><div class="row-sub">${esc(row.city || '')}</div></td><td>${esc(row.email || '—')}<div class="row-sub">${esc(row.phone || '')}</div></td><td>${badge(row.role)}</td><td>${row.operations_role ? badge(row.operations_role) : '—'}</td><td>${badge(row.status || 'active')}</td><td class="codeish">${esc(row.id)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderUsers() {
  $('#usersView').innerHTML = `<section class="panel"><div class="panel-head"><div><h2>People</h2><p>Customers, drivers, couriers, merchants and administrators.</p></div><div class="toolbar"><input id="userSearch" placeholder="Search name, email or phone"><select id="userRole"><option value="">All roles</option><option value="passenger">Customer</option><option value="driver">Driver</option><option value="courier">Courier</option><option value="merchant">Merchant</option><option value="admin">Admin</option></select></div></div><div id="usersTable"></div></section>`;
  const load = async () => {
    const params = new URLSearchParams();
    if ($('#userSearch').value.trim()) params.set('search', $('#userSearch').value.trim());
    if ($('#userRole').value) params.set('role', $('#userRole').value);
    const data = await request(`/ops/users?${params}`);
    $('#usersTable').innerHTML = usersTable(data.items);
  };
  let timer;
  $('#userSearch').oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
  $('#userRole').onchange = load;
  await load();
}

function simpleTable(rows, columns) {
  if (!rows?.length) return '<div class="empty">No records found.</div>';
  return `<div class="table-wrap"><table><thead><tr>${columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(column => `<td>${column.render ? column.render(row) : esc(row[column.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

async function renderSafety() {
  const data = await request('/ops/safety-reports');
  const canManage = roleRank(state.me.ops_role) >= roleRank('manager');
  $('#safetyView').innerHTML = `<section class="panel"><div class="panel-head"><div><h2>Safety reports</h2><p>CS can read. Manager/Admin can update investigation status.</p></div></div><div id="safetyTable">${simpleTable(data.items, [
    { label: 'Report', render: r => `<div class="row-title">${esc(r.report_type || 'Safety report')}</div><div class="row-sub">${esc((r.message || r.description || '').slice(0, 100))}</div>` },
    { label: 'Reporter', render: r => esc(r.user_name || r.user_email || 'User') },
    { label: 'Status', render: r => badge(r.status) },
    { label: 'Updated', render: r => fmt(r.updated_at || r.created_at) },
    { label: '', render: r => canManage ? `<button class="secondary small-btn" data-safety-id="${esc(r.id)}" data-safety-status="${esc(r.status)}">Review</button>` : '' },
  ])}</div></section>`;
  if (canManage) $('#safetyTable').onclick = event => {
    const button = event.target.closest('[data-safety-id]');
    if (button) openSafetyAction(button.dataset.safetyId, button.dataset.safetyStatus);
  };
}

function openSafetyAction(reportId, currentStatus) {
  $('#actionDialogBody').innerHTML = `<h2>Update safety report</h2><form id="safetyForm" class="form-grid"><label>Status<select id="safetyStatus">${['submitted', 'open', 'in_review', 'resolved', 'dismissed'].map(status => `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${status.replaceAll('_', ' ')}</option>`).join('')}</select></label><label>Internal notes<textarea id="safetyNotes"></textarea></label><button class="primary" type="submit">Save safety update</button></form>`;
  $('#actionDialog').showModal();
  $('#safetyForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await request(`/ops/safety-reports/${encodeURIComponent(reportId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: $('#safetyStatus').value,
          notes: $('#safetyNotes').value.trim() || null,
        }),
      });
      $('#actionDialog').close();
      toast('Safety report updated.');
      await renderSafety();
    } catch (error) { toast(error.message, true); }
  };
}

async function renderVerifications() {
  const data = await request('/ops/verifications');
  $('#verificationsView').innerHTML = `<section class="panel"><div class="panel-head"><div><h2>Driver verification queue</h2><p>Manager review is read-only here. Approval/rejection remains an Admin action.</p></div></div>${simpleTable(data.items, [
    { label: 'Driver', render: r => `<div class="row-title">${esc(r.name || 'Driver')}</div><div class="row-sub">${esc(r.email || r.phone || '')}</div>` },
    { label: 'City', key: 'city' },
    { label: 'Verification', render: r => badge(r.verification_status) },
    { label: 'Submitted', render: r => fmt(r.verification_submitted_at) },
    { label: 'Updated', render: r => fmt(r.updated_at) },
  ])}</section>`;
}

function staffTable(data) {
  if (!data.items.length) return '<div class="empty">No operations staff configured.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Staff</th><th>Role</th><th>Title</th><th>Access</th><th></th></tr></thead><tbody>${data.items.map(member => `<tr><td><div class="row-title">${esc(member.name || member.email || 'Staff')}</div><div class="row-sub">${esc(member.email || '')}</div></td><td>${badge(member.role)}</td><td>${esc(member.title || '—')}</td><td>${badge(member.enabled ? 'active' : 'disabled')}</td><td>${data.can_manage && member.role !== 'admin' ? `<button class="secondary small-btn" data-edit-staff="${esc(member.id)}">Manage</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderStaff() {
  const data = await request('/ops/staff');
  state.staff = data.items;
  $('#staffView').innerHTML = `<section class="panel"><div class="panel-head"><div><h2>Operations team</h2><p>Customer Support → Manager → Admin. Admin is the existing protected app role.</p></div>${data.can_manage ? '<button id="addStaffBtn" class="primary">Add staff</button>' : ''}</div><div id="staffTable">${staffTable(data)}</div></section>`;
  if (data.can_manage) {
    $('#addStaffBtn').onclick = openAddStaff;
    $('#staffTable').onclick = event => {
      const button = event.target.closest('[data-edit-staff]');
      if (button) openEditStaff(data.items.find(item => item.id === button.dataset.editStaff));
    };
  }
}

function openAddStaff() {
  $('#actionDialogBody').innerHTML = `<h2>Add Operations staff</h2><p class="meta">The person must already have a normal LetsGoRide email account. Their mobile product role is not changed.</p><form id="addStaffForm" class="form-grid"><label>User ID<input id="staffUserId" required placeholder="Find the user ID in People"></label><div class="form-row"><label>Operations role<select id="staffRole"><option value="cs">Customer Support</option><option value="manager">Manager</option></select></label><label>Job title<input id="staffTitle" placeholder="Optional"></label></div><label>Reason<input id="staffReason" required value="Operations team access"></label><button class="primary" type="submit">Grant access</button></form>`;
  $('#actionDialog').showModal();
  $('#addStaffForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await request('/ops/staff', {
        method: 'POST',
        body: JSON.stringify({
          user_id: $('#staffUserId').value.trim(),
          role: $('#staffRole').value,
          title: $('#staffTitle').value.trim() || null,
          reason: $('#staffReason').value.trim(),
        }),
      });
      $('#actionDialog').close();
      toast('Staff access granted.');
      await renderStaff();
    } catch (error) { toast(error.message, true); }
  };
}

function openEditStaff(member) {
  if (!member) return;
  $('#actionDialogBody').innerHTML = `<h2>Manage staff access</h2><p class="meta">${esc(member.name || member.email)}</p><form id="editStaffForm" class="form-grid"><div class="form-row"><label>Role<select id="editStaffRole"><option value="cs" ${member.role === 'cs' ? 'selected' : ''}>Customer Support</option><option value="manager" ${member.role === 'manager' ? 'selected' : ''}>Manager</option></select></label><label>Access<select id="editStaffEnabled"><option value="true" ${member.enabled ? 'selected' : ''}>Enabled</option><option value="false" ${!member.enabled ? 'selected' : ''}>Disabled</option></select></label></div><label>Title<input id="editStaffTitle" value="${esc(member.title || '')}"></label><label>Reason<input id="editStaffReason" required placeholder="Why is access changing?"></label><button class="primary" type="submit">Save access</button></form>`;
  $('#actionDialog').showModal();
  $('#editStaffForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await request(`/ops/staff/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          role: $('#editStaffRole').value,
          title: $('#editStaffTitle').value.trim() || null,
          enabled: $('#editStaffEnabled').value === 'true',
          reason: $('#editStaffReason').value.trim(),
        }),
      });
      $('#actionDialog').close();
      toast('Staff access updated.');
      await renderStaff();
    } catch (error) { toast(error.message, true); }
  };
}

async function renderAudit() {
  const data = await request('/ops/audit-logs');
  $('#auditView').innerHTML = `<section class="panel"><div class="panel-head"><div><h2>Audit trail</h2><p>Accountability for staff and administrative actions.</p></div></div>${simpleTable(data.items, [
    { label: 'Time', render: r => fmt(r.created_at) },
    { label: 'Action', render: r => `<span class="codeish">${esc(r.action)}</span>` },
    { label: 'Actor', render: r => esc(r.actor_role || r.actor_user_id || 'system') },
    { label: 'Target', render: r => `<span class="codeish">${esc(r.target_type || '')}:${esc(r.target_id || '')}</span>` },
  ])}</section>`;
}

boot();
