(() => {
  const refreshButton = document.getElementById('refreshBtn');
  if (!refreshButton) return;

  // The legacy top-bar Refresh handler re-renders the current view. On the
  // map-first Overview that tears down and recreates Leaflet in the same page
  // lifecycle, which can surface a browser call-stack overflow. A document
  // reload is the safer manual refresh for this internal command center: the
  // authenticated session remains in sessionStorage and the map starts cleanly.
  refreshButton.addEventListener('click', event => {
    if (typeof state === 'undefined' || state.currentView !== 'overview') return;
    if (!document.getElementById('opsMap')) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.reload();
  }, { capture: true });
})();
