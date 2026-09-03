(() => {
  const SUPPORT_REALTIME_URL = 'wss://letsgoride-v2-production.onrender.com/realtime';
  let supportRealtimeSocket = null;
  let supportRealtimeRetry = null;
  let supportRealtimeTarget = null;
  let supportRealtimeGeneration = 0;

  function stopSupportRealtime() {
    supportRealtimeGeneration += 1;
    supportRealtimeTarget = null;
    if (supportRealtimeRetry) {
      clearTimeout(supportRealtimeRetry);
      supportRealtimeRetry = null;
    }
    const socket = supportRealtimeSocket;
    supportRealtimeSocket = null;
    if (socket) {
      try { socket.close(1000, 'support dialog closed'); } catch {}
    }
  }

  function setRealtimeState(label) {
    const element = $('#supportRealtimeState');
    if (element) element.textContent = label;
  }

  function startSupportRealtime(messageId, reloadThread) {
    stopSupportRealtime();
    supportRealtimeTarget = messageId;
    const generation = supportRealtimeGeneration;

    const connect = () => {
      if (generation !== supportRealtimeGeneration || supportRealtimeTarget !== messageId || !state.token) return;
      setRealtimeState('Connecting…');
      let socket;
      try {
        socket = new WebSocket(SUPPORT_REALTIME_URL, [
          'letsgoride.realtime.v1',
          `letsgoride.auth.${state.token}`,
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
        if (!message || typeof message !== 'object') return;
        if (message.type === 'realtime.ready') {
          setRealtimeState('Live');
          return;
        }
        if (message.type === 'realtime.ping') {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'realtime.pong' }));
          return;
        }
        if (message.event_id && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'realtime.ack', event_id: message.event_id }));
        }
        if (message.resource_type === 'support_message' && message.resource_id === messageId) {
          void reloadThread().catch(() => undefined);
        }
      };
      socket.onerror = () => undefined;
      socket.onclose = event => {
        if (generation !== supportRealtimeGeneration || supportRealtimeSocket !== socket) return;
        supportRealtimeSocket = null;
        if (event.code === 4401 || event.code === 4403) {
          setRealtimeState('Session expired');
          return;
        }
        if (supportRealtimeTarget === messageId && $('#actionDialog')?.open) {
          setRealtimeState('Reconnecting…');
          supportRealtimeRetry = setTimeout(connect, 1500);
        }
      };
    };

    connect();
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
    return `<article class="${classes}">
      <div class="support-thread-meta"><strong>${esc(sender)}</strong>${role}<span>${fmt(item.created_at)}</span></div>
      <p>${esc(item.message || '')}</p>
    </article>`;
  }

  function renderThreadItems(items) {
    if (!items?.length) return '<div class="empty">No conversation messages yet.</div>';
    return items.map(threadMessageHtml).join('');
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

    const threadContainer = $('#supportThread');
    threadContainer.scrollTop = threadContainer.scrollHeight;
    startSupportRealtime(row.id, reloadThread);

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
    stopSupportRealtime();
    $('#actionDialog').classList.remove('support-dialog');
  });
})();
