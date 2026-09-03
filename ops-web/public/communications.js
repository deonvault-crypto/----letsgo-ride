(() => {
  let socket = null;
  let retry = null;
  let generation = 0;
  const canWrite = () => roleRank(state.me?.ops_role) >= roleRank('manager');
  const isAdmin = () => state.me?.ops_role === 'admin';
  const kinds = { marketing: 'Offers and marketing', service_update: 'Service update', safety_alert: 'Safety alert', app_update: 'App update' };
  const actions = { none: 'No action', support: 'Contact support', ride: 'Book a ride', food: 'Browse food', courier: 'Send a parcel', app_updates: 'App updates' };
  const localDate = value => {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const options = (values, selected) => Object.entries(values).map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');

  window.stopCommunicationsRealtime = () => {
    generation += 1;
    clearTimeout(retry);
    retry = null;
    if (socket) socket.close(1000, 'view closed');
    socket = null;
  };

  function startRealtime() {
    window.stopCommunicationsRealtime();
    const current = generation;
    const token = state.token;
    const connect = () => {
      if (current !== generation || token !== state.token || state.currentView !== 'communications' || document.hidden) return;
      socket = new WebSocket('wss://letsgoride-v2-production.onrender.com/realtime', ['letsgoride.realtime.v1', `letsgoride.auth.${token}`]);
      const active = socket;
      active.onmessage = event => {
        if (current !== generation || active !== socket) return;
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === 'realtime.ping') active.send(JSON.stringify({ type: 'realtime.pong' }));
        if (data.event_id) active.send(JSON.stringify({ type: 'realtime.ack', event_id: data.event_id }));
        if (data.type === 'communications.changed') {
          const notice = $('#communicationsActivity');
          if (notice) { notice.hidden = false; notice.textContent = 'Delivery activity changed. Refresh to see the latest counts.'; }
        }
      };
      active.onclose = event => {
        if (current !== generation || token !== state.token || [4401, 4403].includes(event.code)) return;
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.stopCommunicationsRealtime();
    else if (state.currentView === 'communications' && state.token) startRealtime();
  });

  window.renderCommunications = async () => {
    const token = state.token;
    const rows = await request('/ops/communications');
    if (token !== state.token || state.currentView !== 'communications') return;
    $('#communicationsView').innerHTML = `
      <div class="comms-toolbar"><p>Announcements, offers and alerts sent to the app inbox.</p>${canWrite() ? '<button id="newAnnouncement" class="primary">New announcement</button>' : ''}</div>
      <p id="communicationsActivity" role="status" hidden></p>
      <div class="table-wrap"><table><thead><tr><th>Announcement</th><th>Type</th><th>Status</th><th>Send time</th><th></th></tr></thead><tbody>
      ${rows.map(row => `<tr><td>${esc(row.title)}</td><td>${esc(kinds[row.kind])}</td><td>${esc(row.status)}</td><td>${row.scheduled_at ? esc(fmt(row.scheduled_at)) : 'When published'}</td><td><button class="ghost" data-announcement="${esc(row.id)}">Open</button></td></tr>`).join('')}
      </tbody></table>${rows.length ? '' : '<p class="empty">No announcements yet.</p>'}</div>
      <div id="announcementWorkspace"></div>`;
    $('#newAnnouncement')?.addEventListener('click', () => editDraft());
    $$('#communicationsView [data-announcement]').forEach(button => button.addEventListener('click', () => showAnnouncement(button.dataset.announcement).catch(error => toast(error.message, true))));
    startRealtime();
  };

  function editDraft(row = {}) {
    if (!canWrite()) return;
    const target = $('#announcementWorkspace');
    target.innerHTML = `<form id="announcementForm" class="comms-form">
      <h2>${row.id ? 'Edit draft' : 'New announcement'}</h2>
      <label>Type<select name="kind">${options(kinds, row.kind || 'service_update')}</select></label>
      <label>Title<input name="title" maxlength="100" required value="${esc(row.title || '')}"></label>
      <label>Message<textarea name="body" rows="6" maxlength="2000" required>${esc(row.body || '')}</textarea></label>
      <fieldset><legend>Audience</legend>${Object.entries({ passenger: 'Customers', driver: 'Drivers', courier: 'Couriers', merchant: 'Merchants' }).map(([role, label]) => `<label class="comms-check"><input type="checkbox" name="roles" value="${role}" ${(row.roles || ['passenger']).includes(role) ? 'checked' : ''}>${label}</label>`).join('')}</fieldset>
      <label>Specific account IDs (optional)<textarea name="user_ids" rows="2" placeholder="One account ID per line">${esc((row.user_ids || []).join('\n'))}</textarea></label>
      <p class="muted">Leave account IDs empty to target the selected roles. Marketing goes only to customers who opted in to offers.</p>
      <label>Action<select name="action">${options(actions, row.action || 'none')}</select></label>
      <label class="comms-check"><input name="push" type="checkbox" ${row.push ? 'checked' : ''}>Also send a phone notification, subject to customer preferences</label>
      <div class="comms-columns"><label>Send time (local; optional)<input type="datetime-local" name="scheduled_at" value="${localDate(row.scheduled_at)}"></label><label>Expires (local)<input type="datetime-local" name="expires_at" required value="${localDate(row.expires_at)}"></label></div>
      <p class="error" id="announcementError" role="alert" hidden></p><button class="primary" type="submit">Save and preview</button>
    </form>`;
    const form = $('#announcementForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      $('#announcementError').hidden = true;
      try {
        const values = new FormData(form);
        const body = { title: values.get('title'), body: values.get('body'), kind: values.get('kind'),
          roles: values.getAll('roles'), user_ids: String(values.get('user_ids')).split(/[\s,]+/).filter(Boolean),
          action: values.get('action'), push: values.has('push'),
          scheduled_at: values.get('scheduled_at') ? new Date(values.get('scheduled_at')).toISOString() : null,
          expires_at: new Date(values.get('expires_at')).toISOString() };
        const saved = await request(row.id ? `/ops/communications/${encodeURIComponent(row.id)}?revision=${row.revision}` : '/ops/communications', { method: row.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
        await showAnnouncement(saved.id);
      } catch (error) {
        const output = $('#announcementError');
        if (output) { output.hidden = false; output.textContent = error.message; }
      } finally { button.disabled = false; }
    });
    form.querySelector('input[name="title"]').focus();
  }

  async function showAnnouncement(id) {
    const token = state.token;
    const detail = await request(`/ops/communications/${encodeURIComponent(id)}`);
    const preview = canWrite() ? await request(`/ops/communications/${encodeURIComponent(id)}/preview`) : null;
    if (token !== state.token || state.currentView !== 'communications') return;
    const row = detail.campaign;
    $('#announcementWorkspace').innerHTML = `<section class="comms-detail" aria-label="Announcement preview">
      <div class="comms-toolbar"><h2>${esc(row.title)}</h2><span>${esc(row.status)}</span></div>
      <p class="comms-message">${esc(row.body)}</p><p>Action: ${esc(actions[row.action])}</p>
      <p>${esc(kinds[row.kind])} · ${esc(row.roles.join(', '))} · ${row.push ? 'Inbox and eligible phone notifications' : 'Inbox only'}</p>
      ${preview ? `<p>${preview.matching_accounts} matching accounts. ${preview.marketing_requires_consent ? 'Only explicit offers opt-ins will receive this message.' : ''} Eligibility is checked again at delivery.</p>` : ''}
      <p>Send: ${row.scheduled_at ? esc(fmt(row.scheduled_at)) : 'When published'} · Expires: ${esc(fmt(row.expires_at))}</p>
      <dl class="comms-counts"><div><dt>Inboxes</dt><dd>${detail.metrics.inbox_created}</dd></div><div><dt>Accepted by push provider</dt><dd>${detail.metrics.push_accepted}</dd></div><div><dt>Read in app</dt><dd>${detail.metrics.read}</dd></div><div><dt>Push outcome unknown</dt><dd>${detail.metrics.push_unknown}</dd></div><div><dt>Push failures</dt><dd>${detail.metrics.push_failed}</dd></div></dl>
      <p class="muted">Provider acceptance does not prove phone delivery. Unknown attempts are not automatically repeated.</p>
      <div class="comms-toolbar">${row.status === 'draft' && canWrite() ? '<button id="editAnnouncement" class="secondary">Edit draft</button>' : ''}${row.status === 'draft' && isAdmin() ? `<button id="publishAnnouncement" class="primary">${row.scheduled_at ? 'Schedule announcement' : 'Send announcement'}</button>` : ''}${['draft', 'queued', 'sending'].includes(row.status) && isAdmin() ? '<button id="cancelAnnouncement" class="secondary">Stop sending</button>' : ''}<button id="refreshAnnouncement" class="ghost">Refresh delivery</button></div>
      <p id="announcementActionError" class="error" role="alert" hidden></p></section>`;
    $('#editAnnouncement')?.addEventListener('click', () => editDraft(row));
    $('#refreshAnnouncement').addEventListener('click', () => showAnnouncement(id).catch(error => toast(error.message, true)));
    async function mutate(button, action, body) {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await request(`/ops/communications/${encodeURIComponent(id)}/${action}`, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
        await showAnnouncement(id);
      } catch (error) {
        const output = $('#announcementActionError');
        if (output) { output.hidden = false; output.textContent = error.message; }
      } finally { button.disabled = false; }
    }
    $('#publishAnnouncement')?.addEventListener('click', event => {
      if (confirm(`${row.scheduled_at ? 'Schedule' : 'Send'} “${row.title}” to the selected audience?`)) void mutate(event.currentTarget, 'publish', { revision: row.revision });
    });
    $('#cancelAnnouncement')?.addEventListener('click', event => {
      if (confirm('Stop further sending? Messages already sent cannot be recalled, and an in-flight notification may finish.')) void mutate(event.currentTarget, 'cancel');
    });
  }

  window.renderAppUpdates = async () => {
    const token = state.token;
    const rows = await request('/ops/app-updates');
    if (token !== state.token || state.currentView !== 'appUpdates') return;
    $('#appUpdatesView').innerHTML = `<p>Publish store-version information for the app’s update screen. Enable availability only after that version is public in the store.</p>
      <p>Compatible over-the-air updates download for the next app launch. Native changes require a new store build. Code releases remain in the reviewed release workflow.</p>
      ${['ios', 'android'].map(platform => {
        const row = rows.find(item => item.platform === platform) || {};
        return `<form class="comms-form" data-release="${platform}"><h2>${platform === 'ios' ? 'iOS' : 'Android'}</h2>
          <label>Public version<input name="version" required pattern="[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}" placeholder="2.0.3" value="${esc(row.version || '')}" ${!isAdmin() ? 'disabled' : ''}></label>
          <label>Release notes<textarea name="notes" maxlength="2000" required ${!isAdmin() ? 'disabled' : ''}>${esc(row.notes || '')}</textarea></label>
          <label class="comms-check"><input name="available" type="checkbox" ${row.available_in_store ? 'checked' : ''} ${!isAdmin() ? 'disabled' : ''}>Confirmed publicly available in the store</label>
          ${isAdmin() ? '<label>Reason for change<input name="reason" minlength="3" maxlength="500" required></label><button type="submit" class="primary">Save release information</button>' : ''}<p role="status" class="release-result"></p></form>`;
      }).join('')}`;
    $$('#appUpdatesView form').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button');
      if (!button || button.disabled) return;
      button.disabled = true;
      try {
        const values = new FormData(form);
        await request('/ops/app-updates', { method: 'POST', body: JSON.stringify({ platform: form.dataset.release, version: values.get('version'), notes: values.get('notes'), available_in_store: values.has('available'), reason: values.get('reason') }) });
        form.querySelector('.release-result').textContent = 'Release information saved.';
      } catch (error) { form.querySelector('.release-result').textContent = error.message; }
      finally { button.disabled = false; }
    }));
  };
})();
