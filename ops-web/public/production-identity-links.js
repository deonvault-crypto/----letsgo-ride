(() => {
  'use strict';

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function recipientFromUser(user) {
    if (!user?.id) return null;
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

  async function recipientForUserId(userId) {
    if (!userId) return null;
    const detail = await request(`/admin/users/${encodeURIComponent(userId)}`);
    const user = detail.user || {};
    if (String(user.id || '') !== String(userId)) return null;
    return recipientFromUser(user);
  }

  async function currentWorkforceApplication() {
    const dialog = document.getElementById('workforceApplicationDialog');
    if (!dialog?.open) return null;

    const name = dialog.querySelector('.workforce-review-head h2')?.textContent?.trim() || '';
    const contact = [...dialog.querySelectorAll('.verification-review-contact span')].map(node => node.textContent?.trim() || '');
    const phone = contact[1] || '';

    const matchingCards = [...document.querySelectorAll('[data-workforce-application]')].filter(card => {
      const cardName = card.querySelector('.workforce-identity strong')?.textContent?.trim() || '';
      const cardText = card.textContent || '';
      return cardName === name && (!phone || phone === '—' || cardText.includes(phone));
    });
    if (matchingCards.length !== 1) return null;

    const applicationId = matchingCards[0].dataset.workforceApplication;
    if (!applicationId) return null;
    const applications = await request('/operations/admin/applications');
    return (Array.isArray(applications) ? applications : []).find(item => String(item.id) === String(applicationId)) || null;
  }

  async function currentVerificationDetail() {
    const dialog = document.getElementById('verificationWorkspaceDialog');
    if (!dialog?.open) return null;

    const name = dialog.querySelector('.verification-review-head h2')?.textContent?.trim() || '';
    const contact = [...dialog.querySelectorAll('.verification-review-contact span')].map(node => node.textContent?.trim() || '');
    const email = normalize(contact[0]);
    const phone = normalize(contact[1]);

    const matchingCards = [...document.querySelectorAll('[data-review-verification]')].filter(button => {
      const card = button.closest('.verification-card, article, tr');
      if (!card) return false;
      const text = normalize(card.textContent);
      return Boolean(
        (email && email !== '—' && text.includes(email)) ||
        (phone && phone !== '—' && text.includes(phone)) ||
        (name && text.includes(normalize(name)))
      );
    });
    if (matchingCards.length !== 1) return null;

    const driverId = matchingCards[0].dataset.reviewVerification;
    if (!driverId) return null;
    return request(`/admin/verifications/${encodeURIComponent(driverId)}`);
  }

  async function messageWorkforceApplicant(button) {
    button.disabled = true;
    try {
      const application = await currentWorkforceApplication();
      if (!application?.user_id) throw new Error('This application is not linked to a LetsGoRide account.');
      const recipient = await recipientForUserId(application.user_id);
      if (!recipient) throw new Error('The linked LetsGoRide account could not be loaded for messaging.');

      document.getElementById('workforceApplicationDialog')?.close();
      window.openOpsProactiveSupport?.(recipient, {
        subject: `LetsGoRide ${String(application.product || 'worker')} application`,
        message: `Hi ${application.full_name || recipient.name || 'there'}, we are reviewing your LetsGoRide application and need to confirm some information with you.`,
      });
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function messageVerificationApplicant(button) {
    button.disabled = true;
    try {
      const detail = await currentVerificationDetail();
      const userId = detail?.user?.id || detail?.driver?.user_id;
      if (!userId) throw new Error('This verification is not linked to a LetsGoRide account.');
      const recipient = await recipientForUserId(userId);
      if (!recipient) throw new Error('The linked LetsGoRide account could not be loaded for messaging.');

      const name = detail?.driver?.name || detail?.user?.name || recipient.name || 'driver';
      document.getElementById('verificationWorkspaceDialog')?.close();
      window.openOpsProactiveSupport?.(recipient, {
        subject: 'LetsGoRide verification',
        message: `Hi ${name}, we are reviewing your LetsGoRide verification application and need to confirm some information with you.`,
      });
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener('click', event => {
    const workforceButton = event.target.closest?.('[data-message-workforce]');
    if (workforceButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void messageWorkforceApplicant(workforceButton);
      return;
    }

    const verificationButton = event.target.closest?.('[data-message-applicant]');
    if (verificationButton && document.getElementById('verificationWorkspaceDialog')?.open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void messageVerificationApplicant(verificationButton);
    }
  }, true);
})();