(() => {
  'use strict';

  function protectOwnAdminWorkspace() {
    const dialog = document.getElementById('personWorkspaceDialog');
    if (!dialog || !state?.me?.id) return;
    const accountIds = [...dialog.querySelectorAll('.profile-contact-grid .codeish')];
    const viewingOwnAccount = accountIds.some(node => node.textContent?.trim() === String(state.me.id));
    if (!viewingOwnAccount) return;

    const controls = dialog.querySelector('.account-controls');
    const row = controls?.querySelector('.account-control-row');
    if (!controls || !row || row.dataset.selfProtected === 'true') return;

    row.dataset.selfProtected = 'true';
    row.innerHTML = '<div class="profile-empty"><strong>Your administrator account is protected.</strong><span>Use a different administrator for account-status or product-role changes. This prevents accidental Ops lockout.</span></div>';
  }

  const observer = new MutationObserver(() => protectOwnAdminWorkspace());
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', () => queueMicrotask(protectOwnAdminWorkspace), true);
})();
