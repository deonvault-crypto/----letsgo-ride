(() => {
  'use strict';

  let selectedRecipient = null;
  let searchTimer = null;

  function actionDialog() {
    return document.getElementById('actionDialog');
  }

  function actionBody() {
    return document.getElementById('actionDialogBody');
  }

  function recipientLabel(user) {
    return user?.name || user?.email || user?.phone || 'LetsGoRide user';
  }

  function recipientMeta(user) {
    return [user?.email, user?.phone, user?.city, user?.role].filter(Boolean).join(' · ');
  }

  function selectedRecipientMarkup(user) {
    if (!user) return '<div class="proactive-recipient-empty">Choose a user below.</div>';
    return `
      <div class="proactive-recipient-selected">
        <div>
          <strong>${esc(recipientLabel(user))}</strong>
          <span>${esc(recipientMeta(user))}</span>
        </div>
        <button type="button" class="link-btn" id="changeProactiveRecipient">Change</button>
      </div>`;
  }

  function recipientResultsMarkup(rows) {
    if (!rows?.length) {
      return '<div class="proactive-recipient-empty">No matching users. Search by name, email, phone, city or role.</div>';
    }
    return rows.map(row => `
      <button type="button" class="proactive-recipient-row" data-proactive-user="${esc(row.id)}">
        <span class="proactive-recipient-avatar">${esc((row.name || row.email || '?').trim().charAt(0).toUpperCase())}</span>
        <span class="proactive-recipient-copy">
          <strong>${esc(recipientLabel(row))}</strong>
          <small>${esc(recipientMeta(row))}</small>
        </span>
        <span class="badge gray">${esc(String(row.status || 'active').replaceAll('_', ' '))}</span>
      </button>`).join('');
  }

  async function searchRecipients(term = '') {
    const results = document.getElementById('proactiveRecipientResults');
    if (!results) return;
    results.innerHTML = '<div class="loading-line">Finding users…</div>';
    try {
      const params = new URLSearchParams({ limit: '40' });
      if (term.trim()) params.set('search', term.trim());
      const data = await request(`/ops/support/recipients?${params}`);
      if (!document.getElementById('proactiveRecipientResults')) return;
      results.innerHTML = recipientResultsMarkup(data.items || []);
      results.onclick = event => {
        const row = event.target.closest('[data-proactive-user]');
        if (!row) return;
        const picked = (data.items || []).find(item => item.id === row.dataset.proactiveUser);
        if (!picked) return;
        selectedRecipient = picked;
        renderRecipientSelection(false);
      };
    } catch (error) {
      results.innerHTML = `<div class="error">${esc(error.message)}</div>`;
    }
  }

  function renderRecipientSelection(showSearch) {
    const selected = document.getElementById('proactiveRecipientSelected');
    const searchArea = document.getElementById('proactiveRecipientSearchArea');
    if (!selected || !searchArea) return;
    selected.innerHTML = selectedRecipientMarkup(selectedRecipient);
    searchArea.hidden = !showSearch && Boolean(selectedRecipient);

    document.getElementById('changeProactiveRecipient')?.addEventListener('click', () => {
      selectedRecipient = null;
      renderRecipientSelection(true);
      document.getElementById('proactiveRecipientSearch')?.focus();
      void searchRecipients(document.getElementById('proactiveRecipientSearch')?.value || '');
    });
  }

  function openComposer(target = null, seed = {}) {
    const dialog = actionDialog();
    const body = actionBody();
    if (!dialog || !body) return;
    selectedRecipient = target;
    clearTimeout(searchTimer);

    body.innerHTML = `
      <div class="proactive-chat-head">
        <p class="eyebrow">Direct support</p>
        <h2>Message a user</h2>
        <p class="meta">Start a support conversation from LetsGoRide. The user gets an in-app notification and can reply from their existing Support screen.</p>
      </div>
      <form id="proactiveSupportForm" class="form-grid">
        <div>
          <label class="proactive-label">Recipient</label>
          <div id="proactiveRecipientSelected"></div>
          <div id="proactiveRecipientSearchArea" class="proactive-search-area">
            <input id="proactiveRecipientSearch" autocomplete="off" placeholder="Search name, email, phone, city or role">
            <div id="proactiveRecipientResults" class="proactive-recipient-results"></div>
          </div>
        </div>
        <label>Subject<input id="proactiveSubject" required maxlength="160" value="${esc(seed.subject || '')}" placeholder="What do we need to discuss?"></label>
        <label>Message<textarea id="proactiveMessage" required maxlength="5000" placeholder="Write the message the user should receive…">${esc(seed.message || '')}</textarea></label>
        <div class="proactive-send-note">This is a one-to-one support conversation, not a marketing broadcast.</div>
        <button class="primary" type="submit" id="proactiveSendButton">Start conversation & notify user</button>
      </form>`;

    renderRecipientSelection(!selectedRecipient);
    const search = document.getElementById('proactiveRecipientSearch');
    if (search) {
      search.oninput = () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => void searchRecipients(search.value), 220);
      };
      if (!selectedRecipient) void searchRecipients('');
    }

    document.getElementById('proactiveSupportForm').onsubmit = async event => {
      event.preventDefault();
      if (!selectedRecipient?.id) {
        toast('Choose a user before starting the conversation.', true);
        return;
      }
      const button = document.getElementById('proactiveSendButton');
      try {
        button.disabled = true;
        button.textContent = 'Starting conversation…';
        const created = await request('/ops/support/conversations', {
          method: 'POST',
          body: JSON.stringify({
            user_id: selectedRecipient.id,
            subject: document.getElementById('proactiveSubject').value.trim(),
            message: document.getElementById('proactiveMessage').value.trim(),
          }),
        });
        dialog.close();
        toast(`Conversation started with ${recipientLabel(selectedRecipient)}.`);
        selectedRecipient = null;
        if (typeof openView === 'function') await openView('support');
        if (typeof openSupportAction === 'function') await openSupportAction(created);
      } catch (error) {
        toast(error.message, true);
        button.disabled = false;
        button.textContent = 'Start conversation & notify user';
      }
    };

    dialog.showModal();
    if (!selectedRecipient) setTimeout(() => document.getElementById('proactiveRecipientSearch')?.focus(), 0);
  }

  async function recipientForUserId(userId) {
    if (!userId) return null;
    if (state?.me?.ops_role === 'admin') {
      const detail = await request(`/admin/users/${encodeURIComponent(userId)}`);
      const user = detail.user || {};
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
    const data = await request(`/ops/support/recipients?search=${encodeURIComponent(userId)}&limit=100`);
    return (data.items || []).find(item => item.id === userId) || null;
  }

  async function recipientForContact(contact) {
    if (!contact || contact === '—') return null;
    const data = await request(`/ops/support/recipients?search=${encodeURIComponent(contact)}&limit=20`);
    const normalized = String(contact).trim().toLowerCase();
    return (data.items || []).find(item =>
      String(item.email || '').trim().toLowerCase() === normalized ||
      String(item.phone || '').trim().toLowerCase() === normalized
    ) || (data.items || [])[0] || null;
  }

  function enhanceSupportInbox() {
    const view = document.getElementById('supportView');
    if (!view || view.hidden) return;
    const toolbar = view.querySelector('.panel-head .toolbar');
    if (!toolbar || toolbar.querySelector('[data-start-proactive-support]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary';
    button.dataset.startProactiveSupport = 'true';
    button.textContent = 'New conversation';
    button.addEventListener('click', () => openComposer());
    toolbar.prepend(button);
  }

  function enhancePersonWorkspace() {
    const dialog = document.getElementById('personWorkspaceDialog');
    if (!dialog?.open) return;
    const actions = dialog.querySelector('.profile-primary-actions');
    const identityButton = dialog.querySelector('[data-person-case]');
    if (!actions || !identityButton || actions.querySelector('[data-message-person]')) return;
    const userId = identityButton.dataset.personCase;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary';
    button.dataset.messagePerson = userId;
    button.textContent = 'Message user';
    button.addEventListener('click', async () => {
      try {
        button.disabled = true;
        const recipient = await recipientForUserId(userId);
        if (!recipient) throw new Error('This user could not be loaded for messaging.');
        dialog.close();
        openComposer(recipient);
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
    actions.prepend(button);
  }

  function enhanceVerificationWorkspace() {
    const dialog = document.getElementById('verificationWorkspaceDialog');
    if (!dialog?.open) return;
    const head = dialog.querySelector('.verification-review-head');
    if (!head || head.querySelector('[data-message-applicant]')) return;
    const contact = head.querySelector('.verification-review-contact span')?.textContent?.trim() || '';
    if (!contact || contact === '—') return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.dataset.messageApplicant = 'true';
    button.textContent = 'Message applicant';
    button.addEventListener('click', async () => {
      try {
        button.disabled = true;
        const recipient = await recipientForContact(contact);
        if (!recipient) throw new Error('The applicant account could not be matched for messaging.');
        const name = dialog.querySelector('.verification-review-head h2')?.textContent?.trim() || 'driver';
        dialog.close();
        openComposer(recipient, {
          subject: 'LetsGoRide verification',
          message: `Hi ${name}, we are reviewing your LetsGoRide verification application and need to confirm some information with you.`,
        });
      } catch (error) {
        toast(error.message, true);
      } finally {
        button.disabled = false;
      }
    });
    head.appendChild(button);
  }

  function enhance() {
    enhanceSupportInbox();
    enhancePersonWorkspace();
    enhanceVerificationWorkspace();
  }

  const observer = new MutationObserver(enhance);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  window.openOpsProactiveSupport = openComposer;
  setTimeout(enhance, 0);
})();
