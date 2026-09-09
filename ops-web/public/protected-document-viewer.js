(() => {
  'use strict';

  const nativeOpen = window.open.bind(window);
  const protectedViewPath = /^\/api\/(?:admin\/verifications\/[^/]+\/documents\/[^/]+|operations\/admin\/applications\/[^/]+\/documents\/[^/]+)\/view$/;

  function showFailure(preview, message) {
    if (preview && !preview.closed) {
      try {
        preview.document.title = 'Protected document unavailable';
        preview.document.body.innerHTML = '';
        const paragraph = preview.document.createElement('p');
        paragraph.textContent = message;
        paragraph.style.fontFamily = 'system-ui, sans-serif';
        paragraph.style.padding = '24px';
        preview.document.body.appendChild(paragraph);
      } catch {}
    }
    if (typeof toast === 'function') toast(message, true);
  }

  async function openAuthenticatedDocument(url, target) {
    const parsed = new URL(String(url), window.location.origin);
    const directPath = parsed.pathname.replace(/\/view$/, '');
    const preview = nativeOpen('about:blank', target || '_blank');
    if (preview) {
      try { preview.opener = null; } catch {}
    }

    try {
      const token = sessionStorage.getItem('lgr_ops_token') || '';
      if (!token) throw new Error('Your operations session expired. Please sign in again.');
      const response = await fetch(directPath, {
        method: 'GET',
        headers: {
          Accept: '*/*',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
      if (!response.ok) {
        let message = `Protected document request failed (${response.status}).`;
        try {
          const body = await response.json();
          message = body?.error || message;
        } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (preview && !preview.closed) {
        preview.location.replace(objectUrl);
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      showFailure(preview, error instanceof Error ? error.message : 'The protected document could not be opened.');
    }
    return preview;
  }

  window.open = function letsGoRideProtectedDocumentOpen(url, target, features) {
    try {
      const parsed = new URL(String(url), window.location.origin);
      if (
        parsed.origin === window.location.origin
        && protectedViewPath.test(parsed.pathname)
        && parsed.searchParams.has('document_token')
      ) {
        void openAuthenticatedDocument(parsed, target);
        return null;
      }
    } catch {
      // Delegate malformed/non-document URLs to the browser unchanged.
    }
    return nativeOpen(url, target, features);
  };
})();
