(() => {
  'use strict';

  let workforceApplicationId = '';
  let verificationDriverId = '';

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

  async function applicationById(applicationId) {
    if (!applicationId) return null;
    const applications = await request('/operations/admin/applications');
    if (!Array.isArray(applications)) return null;
    return applications.find(item => String(item.id || '') === String(applicationId)) || null;
  }

  async function messageWorkforceApplicant(button) {
    button.disabled = true;
    try {
      const application = await applicationById(workforceApplicationId);
      if (!application) throw new Error('This worker application could not be loaded from production.');
      if (!application.user_id) throw new Error('This worker application is not linked to a LetsGoRide account.');

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
      if (!verificationDriverId) throw new Error('This verification record could not be identified.');
      const detail = await request(`/admin/verifications/${encodeURIComponent(verificationDriverId)}`);
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
    const workforceReview = event.target.closest?.('[data-review-workforce]');
    if (workforceReview?.dataset.reviewWorkforce) {
      workforceApplicationId = workforceReview.dataset.reviewWorkforce;
    }

    const verificationReview = event.target.closest?.('[data-review-verification]');
    if (verificationReview?.dataset.reviewVerification) {
      verificationDriverId = verificationReview.dataset.reviewVerification;
    }

    const personVerification = event.target.closest?.('[data-person-verification]');
    if (personVerification?.dataset.personVerification) {
      verificationDriverId = personVerification.dataset.personVerification;
    }

    const workforceMessage = event.target.closest?.('[data-message-workforce]');
    if (workforceMessage) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void messageWorkforceApplicant(workforceMessage);
      return;
    }

    const verificationMessage = event.target.closest?.('[data-message-applicant]');
    if (verificationMessage && document.getElementById('verificationWorkspaceDialog')?.open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void messageVerificationApplicant(verificationMessage);
    }
  }, true);
})();