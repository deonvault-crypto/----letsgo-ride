(() => {
  'use strict';

  const REALTIME_URL = 'wss://letsgoride-v2-production.onrender.com/realtime';
  const RECONNECT_MS = 1500;
  const RECONCILE_MS = 10000;
  const EVENT_REFRESH_DEBOUNCE_MS = 300;

  const VIEW_RESOURCE_TYPES = {
    live: new Set(['hailing_trip', 'courier_delivery', 'food_order', 'ride', 'ride_request']),
    cases: new Set(['ops_case']),
    users: new Set(['user', 'driver', 'courier', 'worker_application', 'profile_photo']),
    safety: new Set(['report', 'safety_report']),
    verifications: new Set(['verification', 'driver', 'profile_photo', 'worker_application']),
    workforce: new Set(['worker_application', 'user', 'driver', 'courier', 'restaurant']),
    staff: new Set(['ops_staff', 'user']),
    appUpdates: new Set(['app_release']),
  };

  const SELF_MANAGED_VIEWS = new Set(['overview', 'support', 'communications']);
  const seenEvents = new Set();

  let realtimeSocket = null;
  let reconnectTimer = null;
  let reconcileTimer = null;
  let refreshTimer = null;
  let generation = 0;
  let activeToken = '';
  let refreshInFlight = false;
  let refreshPending = false;

  function setStatus(label, mode = '') {
    let element = document.getElementById('opsGlobalRealtimeState');
    if (!element) {
      const actions = document.querySelector('.top-actions');
      if (!actions) return;
      element = document.createElement('div');
      element.id = 'opsGlobalRealtimeState';
      element.className = 'status-pill';
      element.innerHTML = '<span class="dot"></span><span class="ops-global-live-label">Live</span>';
      actions.appendChild(element);
    }
    element.classList.toggle('reconnecting', mode === 'reconnecting');
    element.classList.toggle('offline', mode === 'offline');
    const labelNode = element.querySelector('.ops-global-live-label');
    if (labelNode) labelNode.textContent = label;
  }

  function stopTimers() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (reconcileTimer) {
      clearTimeout(reconcileTimer);
      reconcileTimer = null;
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function stopOpsRealtime() {
    generation += 1;
    activeToken = '';
    stopTimers();
    refreshInFlight = false;
    refreshPending = false;
    const socket = realtimeSocket;
    realtimeSocket = null;
    if (socket) {
      try { socket.close(1000, 'ops global realtime stopped'); } catch {}
    }
    setStatus('Offline', 'offline');
  }

  window.stopOpsGlobalRealtime = stopOpsRealtime;

  function updateBadge(id, value) {
    const node = document.getElementById(id);
    if (!node) return;
    const count = Number(value || 0);
    node.hidden = !Number.isFinite(count) || count <= 0;
    node.textContent = count > 0 ? String(count) : '';
  }

  async function refreshNavigationBadges() {
    if (!state?.token) return;
    try {
      const overview = await request('/ops/overview');
      updateBadge('caseBadge', overview.open_ops_cases);
      updateBadge('verificationBadge', overview.pending_driver_verifications);
      updateBadge('supportBadge', overview.open_support_cases);
      updateBadge('safetyBadge', overview.open_safety_reports);
    } catch {
      // Navigation badges are a convenience layer; never interrupt staff work if this read fails.
    }

    if (state?.me?.ops_role !== 'admin' || !document.getElementById('workforceBadge')) return;
    try {
      const rows = await request('/operations/admin/applications');
      const actionable = Array.isArray(rows)
        ? rows.filter(item => ['SUBMITTED', 'UNDER_REVIEW'].includes(String(item?.status || '').toUpperCase())).length
        : 0;
      updateBadge('workforceBadge', actionable);
    } catch {
      // Leave the last known workforce badge in place if the read is temporarily unavailable.
    }
  }

  function currentViewElement() {
    const name = String(state?.currentView || '');
    return name ? document.getElementById(`${name}View`) : null;
  }

  function hasChangedControl(view) {
    if (!view) return false;
    return [...view.querySelectorAll('input, select, textarea')].some(control => {
      if (control.disabled) return false;
      if (control.matches('input[type="checkbox"], input[type="radio"]')) {
        return control.checked !== control.defaultChecked;
      }
      if (control.tagName === 'SELECT') {
        const defaultOption = [...control.options].find(option => option.defaultSelected) || control.options[0];
        return Boolean(defaultOption) && control.value !== defaultOption.value;
      }
      return String(control.value || '') !== String(control.defaultValue || '');
    });
  }

  function shouldDeferViewRefresh() {
    if (document.querySelector('dialog[open]')) return true;
    const view = currentViewElement();
    if (!view || view.hidden) return true;
    const active = document.activeElement;
    if (active && view.contains(active) && active.matches('input, select, textarea, [contenteditable="true"]')) return true;
    return hasChangedControl(view);
  }

  async function refreshCurrentView() {
    const name = String(state?.currentView || '');
    if (!state?.token || document.hidden || !name || SELF_MANAGED_VIEWS.has(name)) return;
    if (shouldDeferViewRefresh()) {
      refreshPending = true;
      return;
    }
    if (refreshInFlight) {
      refreshPending = true;
      return;
    }

    refreshInFlight = true;
    refreshPending = false;
    try {
      await openView(name);
    } catch {
      // Existing view rendering already owns user-facing error handling.
    } finally {
      refreshInFlight = false;
      if (refreshPending && !shouldDeferViewRefresh()) scheduleViewRefresh(250);
    }
  }

  function scheduleViewRefresh(delay = EVENT_REFRESH_DEBOUNCE_MS) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshCurrentView();
    }, delay);
  }

  function eventMatchesCurrentView(message) {
    const view = String(state?.currentView || '');
    if (!view || SELF_MANAGED_VIEWS.has(view)) return false;
    if (view === 'audit') return true;
    const resources = VIEW_RESOURCE_TYPES[view];
    return Boolean(resources?.has(String(message?.resource_type || '')));
  }

  function rememberEvent(eventId) {
    if (!eventId) return true;
    if (seenEvents.has(eventId)) return false;
    seenEvents.add(eventId);
    if (seenEvents.size > 300) {
      const oldest = seenEvents.values().next().value;
      if (oldest) seenEvents.delete(oldest);
    }
    return true;
  }

  function handleRealtimeMessage(message, socket) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'realtime.ready') {
      setStatus('Live');
      void refreshNavigationBadges();
      return;
    }
    if (message.type === 'realtime.ping') {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'realtime.pong' }));
      return;
    }
    if (message.event_id && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'realtime.ack', event_id: message.event_id }));
    }
    if (!rememberEvent(message.event_id)) return;

    // Support owns its own exact-thread refresh and toast behavior. The global layer only
    // keeps shared navigation counts current for support events.
    void refreshNavigationBadges();
    if (message.resource_type !== 'support_message' && eventMatchesCurrentView(message)) {
      scheduleViewRefresh();
    }
  }

  function scheduleReconcile(delay = RECONCILE_MS) {
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(async () => {
      reconcileTimer = null;
      if (state?.token && !document.hidden) {
        await refreshNavigationBadges();
        await refreshCurrentView();
      }
      if (state?.token) scheduleReconcile(RECONCILE_MS);
    }, delay);
  }

  function ensureOpsRealtime() {
    const token = String(state?.token || '');
    if (!token) {
      stopOpsRealtime();
      return;
    }
    if (
      realtimeSocket &&
      activeToken === token &&
      [WebSocket.OPEN, WebSocket.CONNECTING].includes(realtimeSocket.readyState)
    ) return;

    generation += 1;
    stopTimers();
    activeToken = token;
    const localGeneration = generation;

    const connect = () => {
      if (localGeneration !== generation || activeToken !== token || state?.token !== token) return;
      setStatus('Connecting…', 'reconnecting');
      let socket;
      try {
        socket = new WebSocket(REALTIME_URL, [
          'letsgoride.realtime.v1',
          `letsgoride.auth.${token}`,
        ]);
      } catch {
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
        scheduleReconcile(2500);
        return;
      }
      realtimeSocket = socket;

      socket.onopen = () => {
        if (localGeneration !== generation || realtimeSocket !== socket) return;
        setStatus('Live');
        void refreshNavigationBadges();
        scheduleReconcile(RECONCILE_MS);
      };
      socket.onmessage = event => {
        if (localGeneration !== generation || realtimeSocket !== socket || typeof event.data !== 'string') return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        handleRealtimeMessage(message, socket);
      };
      socket.onerror = () => undefined;
      socket.onclose = event => {
        if (localGeneration !== generation || realtimeSocket !== socket) return;
        realtimeSocket = null;
        if (event.code === 4401 || event.code === 4403) {
          setStatus('Session expired', 'offline');
          return;
        }
        if (state?.token === token) {
          setStatus('Reconnecting…', 'reconnecting');
          reconnectTimer = setTimeout(connect, RECONNECT_MS);
          scheduleReconcile(2500);
        }
      };
    };

    connect();
  }

  const previousShowApp = showApp;
  showApp = function showAppWithGlobalRealtime() {
    previousShowApp();
    ensureOpsRealtime();
  };

  document.getElementById('logoutBtn')?.addEventListener('click', stopOpsRealtime, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (state?.token) {
      ensureOpsRealtime();
      void refreshNavigationBadges();
      scheduleViewRefresh(100);
    }
  });
  document.addEventListener('focusin', () => {
    if (refreshPending && !shouldDeferViewRefresh()) scheduleViewRefresh(250);
  });
  document.addEventListener('change', () => {
    if (refreshPending && !shouldDeferViewRefresh()) scheduleViewRefresh(250);
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', () => {
      if (refreshPending) scheduleViewRefresh(100);
    });
  });

  setTimeout(() => {
    if (state?.token) ensureOpsRealtime();
  }, 0);
})();