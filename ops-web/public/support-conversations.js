(() => {
  const SUPPORT_REALTIME_URL = 'wss://letsgoride-v2-production.onrender.com/realtime';
  let supportRealtimeSocket = null;
  let supportRealtimeRetry = null;
  let supportRealtimeGeneration = 0;
  let supportRealtimeToken = '';
  let activeThreadId = null;
  let activeThreadReload = null;
  let activeThreadItems = [];
  const seenSupportEvents = new Set();

  function stopSupportRealtime() {
    supportRealtimeGeneration += 1;
    supportRealtimeToken = '';
    if (supportRealtimeRetry) {
      clearTimeout(supportRealtimeRetry);
      supportRealtimeRetry = null;
    }
    const socket = supportRealtimeSocket;
    supportRealtimeSocket = null;
    if (socket) {
      try { socket.close(1000, 'ops support realtime stopped'); } catch {}
    }
    setRealtimeState('Offline');
  }

  function setRealtimeState(label) {
    const element = $('#supportRealtimeState');
    if (element) element.textContent = label;
  }

  async function refreshSupportBadge() {
    if (!state?.token) return;
    try {
      const data = await request('/ops/overview');
      const badgeNode = document.getElementById('supportBadge');
      if (!badgeNode) return;
      const count = Number(data.open_support_cases || 0);
      badgeNode.hidden = !Number.isFinite(count) || count <= 0;
      badgeNode.textContent = count > 0 ? String(count) : '';
    } catch {
      // Keep realtime notifications non-blocking if overview metrics are temporarily unavailable.
    }
  }

  async function refreshSupportQueue() {
    if (state?.currentView !== 'support' || typeof renderSupport !== 'function') return;
    try { await renderSupport(); } catch {}
  }

  async function handleSupportRealtimeMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'realtime.ready') {
      setRealtimeState('Live');
      return;
    }
    if (message.type === 'realtime.ping') {
      if (supportRealtimeSocket?.readyState === WebSocket.OPEN) {
        supportRealtimeSocket.send(JSON.stringify({ type: 'realtime.pong' }));
      }
      return;
    }
    if (message.event_id && supportRealtimeSocket?.readyState === WebSocket.OPEN) {
      supportRealtimeSocket.send(JSON.stringify({ type: 'realtime.ack', event_id: message.event_id }));
    }
    if (message.resource_type !== 'support_message') return;

    if (message.event_id) {
      if (seenSupportEvents.has(message.event_id)) return;
      seenSupportEvents.add(message.event_id);
      if (seenSupportEvents.size > 200) {
        const oldest = seenSupportEvents.values().next().value;
        if (oldest) seenSupportEvents.delete(oldest);
      }
    }

    if (message.type === 'support_message.customer_replied') {
      toast('New customer reply in Support.');
      void refreshSupportBadge();
      void refreshSupportQueue();
    }

    if (activeThreadId && message.resource_id === activeThreadId && typeof activeThreadReload === 'function') {
      try { await activeThreadReload(); } catch {}
    }
  }

  function ensureSupportRealtime() {
    const token = String(state?.token || '');
    if (!token) {
      stopSupportRealtime();
      return;
    }
    if (
      supportRealtimeSocket &&
      supportRealtimeToken === token &&
      [WebSocket.OPEN, WebSocket.CONNECTING].includes(supportRealtimeSocket.readyState)
    ) return;

    stopSupportRealtime();
    supportRealtimeToken = token;
    const generation = supportRealtimeGeneration;

    const connect = () => {
      if (generation !== supportRealtimeGeneration || supportRealtimeToken !== token || state?.token !== token) return;
      setRealtimeState('Connecting…');
      let socket;
      try {
        socket = new WebSocket(SUPPORT_REALTIME_URL, [
          'letsgoride.realtime.v1',
          `letsgoride.auth.${token}`,
        ]);
      } catch {
        supportRealtimeRetry = setTimeout(connect, 1500);
        return;
      }
      supportRealtimeSocket = socket;

      socket.onopen = () => {
        if (generation === supportRealtimeGeneration && supportRealtimeSocket === socket) setRealtimeState('Live');
      };
      socket.onmessage = event => {
        if (generation !== supportRealtimeGeneration || supportRealtimeSocket !== socket || typeof event.data !== 'string') return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        void handleSupportRealtimeMessage(message);
      };
      socket.onerror = () => undefined;
      socket.onclose = event => {
        if (generation !== supportRealtimeGeneration || supportRealtimeSocket !== socket) return;
        supportRealtimeSocket = null;
        if (event.code === 4401 || event.code === 4403) {
          setRealtimeState('Session expired');
          return;
        }
        if (state?.token === token) {
          setRealtimeState('Reconnecting…');
          supportRealtimeRetry = setTimeout(connect, 1500);
        }
      };
    };

    connect();
  }

  function canManageStaffMessage(item) {
    if (!item || item.synthetic || item.sender_type !== 'staff' || item.is_internal) return false;
    return state?.me?.ops_role === 'admin' || String(item.sender_user_id || '') === String(state?.me?.id || '');
  }

  function threadMessageHtml(item) {
    const internal = Boolean(item.is_internal);
    const sender = internal
      ? 'Internal note'
      : item.sender_type === 'customer'
        ? (item.sender_name || 'Customer')
        : (item.sender_name || 'LetsGoRide Support');
    const role = item.sender_ops_role ? ` · ${esc(item.sender_ops_role)}` : '';
    const classes = [
      'support-thread-message',
      item.sender_type === 'customer' ? 'customer-message' : 'staff-message',
      internal ? 'internal-message' : '',
    ].filter(Boolean).join(' ');
    const controls = canManageStaffMessage(item)
      ? `<div class="support-thread-actions">
          <button type="button" class="link-btn" data-support-edit-message="${esc(item.id)}">Edit</button>
          <button type="button" class="link-btn support-delete-link" data-support-delete-message="${esc(item.id)}">Delete</button>
        </div>`
      : '';
    return `<article class="${classes}" data-support-thread-message="${esc(item.id || '')}">
      <div class="support-thread-meta"><strong>${esc(sender)}</strong>${role}<span>${fmt(item.created_at)}</span></div>
      <p>${esc(item.message || '')}</p>
      ${controls}
    </article>`;
  }

  function renderThreadItems(items) {
    activeThreadItems = items || [];
    if (!activeThreadItems.length) return '<div class="empty">No conversation messages yet.</div>';
    return activeThreadItems.map(threadMessageHtml).join('');
  }

  // Deliberately overrides only the Support "Handle" action from app.js.
  // All existing navigation, cases, roles and mobile-facing APIs remain unchanged.
  openSupportAction = async function openSupportConversation(row) {
    let thread;
    try {
      thread = await request(`/ops/support/messages/${encodeURIComponent(row.id)}/thread`);
    } catch (error) {
      return toast(error.message, true);
    }

    const customer = thread.customer || {};
    const statuses = ['received', 'open', 'in_review', 'resolved', 'closed'];
    $('#actionDialogBody').innerHTML = `
      <div class="support-conversation-head">
        <div>
          <p class="eyebrow">Customer support conversation</p>
          <h2>${esc(thread.subject || row.subject || 'Support request')}</h2>
          <p class="meta">${esc(customer.name || row.user_name || customer.email || row.user_email || 'Customer')}</p>
        </div>
        <div>${badge(thread.status || row.status)}</div>
      </div>

      <div class="support-customer-strip">
        ${customer.email || row.user_email ? `<span>${esc(customer.email || row.user_email)}</span>` : ''}
        ${customer.phone || row.user_phone ? `<span>${esc(customer.phone || row.user_phone)}</span>` : ''}
        <span class="codeish">${esc(row.id)}</span>
        <span class="codeish" id="supportRealtimeState">Connecting…</span>
      </div>

      <section class="support-thread" id="supportThread" aria-live="polite">
        ${renderThreadItems(thread.items)}
      </section>

      <form id="supportReplyForm" class="form-grid support-composer">
        <label>Status
          <select id="supportConversationStatus">
            ${statuses.map(status => `<option value="${status}" ${status === (thread.status || row.status) ? 'selected' : ''}>${status.replaceAll('_', ' ')}</option>`).join('')}
          </select>
        </label>
        <label>Reply to customer
          <textarea id="supportConversationReply" maxlength="5000" placeholder="Write a reply. The customer will be notified in the app."></textarea>
        </label>
        <div class="modal-actions">
          <button id="supportSaveStatus" class="secondary" type="button">Save status</button>
          <button class="primary" type="submit">Send reply & notify</button>
        </div>
      </form>

      <details class="support-internal-note">
        <summary>Add internal team note</summary>
        <div class="form-grid mt-14">
          <label>Internal note
            <textarea id="supportInternalNote" maxlength="5000" placeholder="Visible to LetsGoRide staff only. Never shown to the customer."></textarea>
          </label>
          <button id="supportAddInternalNote" class="secondary" type="button">Add internal note</button>
        </div>
      </details>`;

    $('#actionDialog').classList.add('support-dialog');
    $('#actionDialog').showModal();

    const reloadThread = async () => {
      const next = await request(`/ops/support/messages/${encodeURIComponent(row.id)}/thread`);
      const container = $('#supportThread');
      if (!container) return next;
      container.innerHTML = renderThreadItems(next.items);
      const status = $('#supportConversationStatus');
      if (status) status.value = next.status || status.value;
      container.scrollTop = container.scrollHeight;
      return next;
    };

    activeThreadId = row.id;
    activeThreadReload = reloadThread;
    ensureSupportRealtime();
    const threadContainer = $('#supportThread');
    threadContainer.scrollTop = threadContainer.scrollHeight;

    threadContainer.onclick = async event => {
      const editButton = event.target.closest('[data-support-edit-message]');
      const deleteButton = event.target.closest('[data-support-delete-message]');
      if (!editButton && !deleteButton) return;
      const messageId = editButton?.dataset.supportEditMessage || deleteButton?.dataset.supportDeleteMessage;
      const item = activeThreadItems.find(candidate => String(candidate.id) === String(messageId));
      if (!item || !canManageStaffMessage(item)) return;

      if (editButton) {
        const nextMessage = window.prompt('Edit support reply', item.message || '');
        if (nextMessage === null) return;
        const cleaned = nextMessage.trim();
        if (!cleaned) return toast('A support reply cannot be empty.', true);
        editButton.disabled = true;
        try {
          await request(`/ops/support/messages/${encodeURIComponent(row.id)}/thread/${encodeURIComponent(messageId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ message: cleaned }),
          });
          toast('Support reply edited.');
          await reloadThread();
        } catch (error) {
          toast(error.message, true);
        } finally {
          editButton.disabled = false;
        }
      }

      if (deleteButton) {
        if (!window.confirm('Delete this support reply? This removes the reply from the customer conversation.')) return;
        deleteButton.disabled = true;
        try {
          await request(`/ops/support/messages/${encodeURIComponent(row.id)}/thread/${encodeURIComponent(messageId)}`, {
            method: 'DELETE',
          });
          toast('Support reply deleted.');
          await reloadThread();
        } catch (error) {
          toast(error.message, true);
        } finally {
          deleteButton.disabled = false;
        }
      }
    };

    $('#supportReplyForm').onsubmit = async event => {
      event.preventDefault();
      const message = $('#supportConversationReply').value.trim();
      if (!message) return toast('Write a reply first.', true);
      const submit = event.submitter;
      if (submit) submit.disabled = true;
      try {
        await request(`/ops/support/messages/${encodeURIComponent(row.id)}/reply`, {
          method: 'POST',
          body: JSON.stringify({
            message,
            status: $('#supportConversationStatus').value,
          }),
        });
        $('#supportConversationReply').value = '';
        toast('Reply sent and customer notified.');
        await reloadThread();
      } catch (error) {
        toast(error.message, true);
      } finally {
        if (submit) submit.disabled = false;
      }
    };

    $('#supportSaveStatus').onclick = async () => {
      const button = $('#supportSaveStatus');
      button.disabled = true;
      try {
        await request(`/ops/support/messages/${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: $('#supportConversationStatus').value,
            reply: null,
          }),
        });
        toast('Support status updated.');
        await reloadThread();
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
      }
    };

    $('#supportAddInternalNote').onclick = async () => {
      const note = $('#supportInternalNote').value.trim();
      if (!note) return toast('Write an internal note first.', true);
      const button = $('#supportAddInternalNote');
      button.disabled = true;
      try {
        await request(`/ops/support/messages/${encodeURIComponent(row.id)}/notes`, {
          method: 'POST',
          body: JSON.stringify({ note }),
        });
        $('#supportInternalNote').value = '';
        toast('Internal note added.');
        await reloadThread();
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
      }
    };
  };

  $('#actionDialog').addEventListener('close', () => {
    activeThreadId = null;
    activeThreadReload = null;
    activeThreadItems = [];
    $('#actionDialog').classList.remove('support-dialog');
  });

  const previousShowApp = showApp;
  showApp = function showAppWithSupportRealtime() {
    previousShowApp();
    ensureSupportRealtime();
  };

  document.getElementById('logoutBtn')?.addEventListener('click', stopSupportRealtime, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state?.token) ensureSupportRealtime();
  });
  setTimeout(() => {
    if (state?.token) ensureSupportRealtime();
  }, 0);
})();
