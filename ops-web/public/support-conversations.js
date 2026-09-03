(() => {
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
      $('#supportThread').innerHTML = renderThreadItems(next.items);
      $('#supportConversationStatus').value = next.status || $('#supportConversationStatus').value;
      const container = $('#supportThread');
      container.scrollTop = container.scrollHeight;
      return next;
    };

    const threadContainer = $('#supportThread');
    threadContainer.scrollTop = threadContainer.scrollHeight;

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
    $('#actionDialog').classList.remove('support-dialog');
  });
})();
