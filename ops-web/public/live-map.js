(() => {
  const REALTIME_URL = 'wss://letsgoride-v2-production.onrender.com/realtime';
  const ZIMBABWE_CENTER = [-19.0154, 29.1549];
  const HARARE_CENTER = [-17.8292, 31.0522];
  const ONLINE_RECONCILE_MS = 15000;
  const DISCONNECTED_RECONCILE_MS = 9000;
  const MOVE_ANIMATION_MS = 900;

  let map = null;
  let tileLayer = null;
  let snapshot = null;
  let activeFilter = 'all';
  let selectedEntityId = null;
  let markers = new Map();
  let animationFrames = new Map();
  let realtimeSocket = null;
  let realtimeRetry = null;
  let reconcileTimer = null;
  let refreshDebounce = null;
  let generation = 0;
  let lastSnapshotAt = null;
  let mapFailed = false;
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

  const originalRenderOverview = window.renderOverview;

  function isOverviewVisible() {
    const view = document.getElementById('overviewView');
    return Boolean(view && !view.hidden && state?.token);
  }

  function stopAnimation(id) {
    const frame = animationFrames.get(id);
    if (frame) cancelAnimationFrame(frame);
    animationFrames.delete(id);
  }

  function stopOpsLiveMap() {
    generation += 1;
    if (reconcileTimer) {
      clearTimeout(reconcileTimer);
      reconcileTimer = null;
    }
    if (realtimeRetry) {
      clearTimeout(realtimeRetry);
      realtimeRetry = null;
    }
    if (refreshDebounce) {
      clearTimeout(refreshDebounce);
      refreshDebounce = null;
    }
    for (const id of animationFrames.keys()) stopAnimation(id);
    const socket = realtimeSocket;
    realtimeSocket = null;
    if (socket) {
      try { socket.close(1000, 'ops map closed'); } catch {}
    }
    markers.clear();
    if (map) {
      try { map.remove(); } catch {}
      map = null;
    }
    tileLayer = null;
    snapshot = null;
    selectedEntityId = null;
    mapFailed = false;
  }

  window.stopOpsLiveMap = stopOpsLiveMap;

  function statusLabel(mode, detail = '') {
    const element = document.getElementById('opsMapStatus');
    if (!element) return;
    element.className = `ops-map-status ${mode || ''}`.trim();
    const dot = '<span class="ops-map-status-dot"></span>';
    element.innerHTML = `${dot}<span>${esc(detail || 'Live')}</span>`;
  }

  function formatAge(value) {
    if (!value) return 'Unknown';
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'Unknown';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  function titleCase(value) {
    return String(value || '')
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/(^|\s)\S/g, match => match.toUpperCase());
  }

  function jobLabel(job) {
    if (!job) return 'Available';
    if (job.type === 'hailing_trip') return 'Ride Now';
    if (job.type === 'courier_delivery') return 'Courier delivery';
    return 'Active job';
  }

  function locationLabel(value) {
    if (!value) return 'Not available';
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return 'Not available';
    return value.address || value.label || value.name || value.description || 'Pinned location';
  }

  function entityIcon(entity, selected = false) {
    const courier = entity.entity_type === 'courier';
    const onJob = Boolean(entity.active_job);
    const heading = Number(entity.heading);
    const rotation = Number.isFinite(heading) ? heading : 0;
    const classes = [
      'ops-vehicle-marker',
      courier ? 'courier' : 'driver',
      onJob ? 'on-job' : '',
      selected ? 'selected' : '',
    ].filter(Boolean).join(' ');
    return L.divIcon({
      className: classes,
      html: `<div class="ops-vehicle-marker-inner" style="--vehicle-heading:${rotation}deg"><span aria-hidden="true">${courier ? '🛵' : '🚗'}</span></div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      tooltipAnchor: [0, -20],
    });
  }

  function markerTooltip(entity) {
    return `<div class="ops-marker-tooltip"><strong>${esc(entity.display_name || 'LetsGoRide worker')}</strong><span>${esc(jobLabel(entity.active_job))} · ${esc(titleCase(entity.operational_status))}</span></div>`;
  }

  function setSelectedEntity(id) {
    selectedEntityId = id;
    for (const [entityId, entry] of markers.entries()) {
      entry.marker.setIcon(entityIcon(entry.entity, entityId === selectedEntityId));
    }
    renderInspector();
  }

  function renderInspector() {
    const panel = document.getElementById('opsMapInspector');
    if (!panel) return;
    const entity = snapshot?.entities?.find(item => item.id === selectedEntityId);
    if (!entity) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    const vehicle = entity.vehicle || {};
    const vehicleText = [vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(' ') || (entity.entity_type === 'driver' ? 'Approved vehicle' : 'Courier');
    const plate = vehicle.plate_number ? ` · ${vehicle.plate_number}` : '';
    const job = entity.active_job;
    const pickup = job?.pickup ?? job?.pickup_address;
    const dropoff = job?.dropoff ?? job?.dropoff_address;
    panel.innerHTML = `
      <div class="ops-inspector-head">
        <div>
          <p class="eyebrow">${esc(entity.entity_type === 'courier' ? 'Courier' : 'Ride Now driver')}</p>
          <h3>${esc(entity.display_name || 'LetsGoRide worker')}</h3>
        </div>
        <button type="button" class="ops-inspector-close" id="opsInspectorClose" aria-label="Close details">×</button>
      </div>
      <div class="ops-inspector-body">
        <div class="ops-inspector-row"><span>Status</span><strong>${esc(titleCase(entity.operational_status || 'online'))}</strong></div>
        ${entity.ride_class ? `<div class="ops-inspector-row"><span>Ride class</span><strong>${esc(titleCase(entity.ride_class))}</strong></div>` : ''}
        <div class="ops-inspector-row"><span>Vehicle</span><strong>${esc(vehicleText + plate)}</strong></div>
        <div class="ops-inspector-row"><span>Last location update</span><strong>${esc(formatAge(entity.updated_at))}</strong></div>
        ${job ? `<div class="ops-inspector-row"><span>Current work</span><strong>${esc(jobLabel(job))} · ${esc(titleCase(job.status || 'active'))}</strong></div>` : ''}
        ${pickup ? `<div class="ops-inspector-row"><span>Pickup</span><strong>${esc(locationLabel(pickup))}</strong></div>` : ''}
        ${dropoff ? `<div class="ops-inspector-row"><span>Destination</span><strong>${esc(locationLabel(dropoff))}</strong></div>` : ''}
      </div>`;
    panel.hidden = false;
    document.getElementById('opsInspectorClose')?.addEventListener('click', () => setSelectedEntity(null));
  }

  function visibleForFilter(entity) {
    if (activeFilter === 'drivers') return entity.entity_type === 'driver';
    if (activeFilter === 'trips') return entity.entity_type === 'driver' && Boolean(entity.active_job);
    if (activeFilter === 'couriers') return entity.entity_type === 'courier';
    if (activeFilter === 'deliveries') return entity.entity_type === 'courier' && Boolean(entity.active_job);
    return true;
  }

  function updateEmptyState() {
    const empty = document.getElementById('opsMapEmpty');
    if (!empty) return;
    const count = [...markers.values()].filter(entry => map.hasLayer(entry.marker)).length;
    if (count > 0 || mapFailed) {
      empty.hidden = true;
      return;
    }
    empty.innerHTML = '<strong>No matching live vehicles</strong>Online workers will appear here as fresh operational location data arrives.';
    empty.hidden = false;
  }

  function applyFilter(next) {
    activeFilter = next;
    document.querySelectorAll('.ops-map-filter').forEach(button => {
      button.classList.toggle('active', button.dataset.filter === activeFilter);
    });
    for (const entry of markers.values()) {
      const visible = visibleForFilter(entry.entity);
      if (visible && !map.hasLayer(entry.marker)) entry.marker.addTo(map);
      if (!visible && map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
    }
    if (selectedEntityId) {
      const selected = markers.get(selectedEntityId)?.entity;
      if (!selected || !visibleForFilter(selected)) setSelectedEntity(null);
    }
    updateEmptyState();
  }

  function animateMarker(id, marker, from, to) {
    stopAnimation(id);
    if (prefersReducedMotion || !from || !to) {
      marker.setLatLng(to);
      return;
    }
    const deltaLat = to.lat - from.lat;
    const deltaLng = to.lng - from.lng;
    if (Math.abs(deltaLat) > 1 || Math.abs(deltaLng) > 1) {
      marker.setLatLng(to);
      return;
    }
    const started = performance.now();
    const step = now => {
      const progress = Math.min(1, (now - started) / MOVE_ANIMATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      marker.setLatLng([
        from.lat + deltaLat * eased,
        from.lng + deltaLng * eased,
      ]);
      if (progress < 1) {
        animationFrames.set(id, requestAnimationFrame(step));
      } else {
        animationFrames.delete(id);
      }
    };
    animationFrames.set(id, requestAnimationFrame(step));
  }

  function reconcileMarkers() {
    if (!map || !snapshot) return;
    const currentIds = new Set();
    for (const entity of snapshot.entities || []) {
      const latitude = Number(entity.latitude);
      const longitude = Number(entity.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      currentIds.add(entity.id);
      const target = L.latLng(latitude, longitude);
      const existing = markers.get(entity.id);
      if (existing) {
        existing.entity = entity;
        existing.marker.setIcon(entityIcon(entity, entity.id === selectedEntityId));
        existing.marker.setTooltipContent(markerTooltip(entity));
        animateMarker(entity.id, existing.marker, existing.marker.getLatLng(), target);
      } else {
        const marker = L.marker(target, { icon: entityIcon(entity, entity.id === selectedEntityId), keyboard: true });
        marker.bindTooltip(markerTooltip(entity), { direction: 'top', opacity: 0.96, className: 'ops-map-tooltip' });
        marker.on('click', () => setSelectedEntity(entity.id));
        markers.set(entity.id, { marker, entity });
        if (visibleForFilter(entity)) marker.addTo(map);
      }
    }
    for (const [id, entry] of markers.entries()) {
      if (currentIds.has(id)) continue;
      stopAnimation(id);
      if (map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
      markers.delete(id);
      if (selectedEntityId === id) selectedEntityId = null;
    }
    renderInspector();
    updateEmptyState();
  }

  function fitInitialMap() {
    if (!map || !snapshot) return;
    const points = (snapshot.entities || [])
      .map(entity => [Number(entity.latitude), Number(entity.longitude)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (points.length === 0) {
      map.setView(ZIMBABWE_CENTER, 6);
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 13 });
  }

  function renderKpis() {
    const rail = document.getElementById('opsKpiRail');
    const cases = document.getElementById('opsMapCases');
    if (!rail || !snapshot) return;
    const kpis = snapshot.kpis || {};
    rail.innerHTML = `
      <button type="button" class="ops-kpi-tile" data-kpi-filter="trips">
        <span class="ops-kpi-label">Ride Now</span><span class="ops-kpi-value">${Number(kpis.active_hailing || 0)}</span><span class="ops-kpi-hint">Active trips</span>
      </button>
      <button type="button" class="ops-kpi-tile" data-kpi-filter="drivers">
        <span class="ops-kpi-label">Drivers online</span><span class="ops-kpi-value">${Number(kpis.online_drivers || 0)}</span><span class="ops-kpi-hint">Fresh presence</span>
      </button>
      <button type="button" class="ops-kpi-tile" data-kpi-filter="deliveries">
        <span class="ops-kpi-label">Deliveries</span><span class="ops-kpi-value">${Number(kpis.active_deliveries || 0)}</span><span class="ops-kpi-hint">Active courier work</span>
      </button>
      <button type="button" class="ops-kpi-tile attention" id="opsAttentionKpi">
        <span class="ops-kpi-label">Attention</span><span class="ops-kpi-value">${Number(kpis.attention || 0)}</span><span class="ops-kpi-hint">Needs review</span>
      </button>`;
    rail.querySelectorAll('[data-kpi-filter]').forEach(button => {
      button.addEventListener('click', () => applyFilter(button.dataset.kpiFilter || 'all'));
    });
    document.getElementById('opsAttentionKpi')?.addEventListener('click', toggleAttentionPanel);
    if (cases) cases.textContent = `Cases ${Number(kpis.open_ops_cases || 0)}`;
    const badge = document.getElementById('caseBadge');
    if (badge) {
      const count = Number(kpis.open_ops_cases || 0);
      badge.hidden = count === 0;
      badge.textContent = count ? String(count) : '';
    }
  }

  function toggleAttentionPanel() {
    const panel = document.getElementById('opsAttentionPanel');
    if (!panel || !snapshot) return;
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    const breakdown = snapshot.kpis?.attention_breakdown || {};
    const rows = [
      ['Pending verification', breakdown.pending_verification, 'verifications'],
      ['Safety reports', breakdown.safety, 'safety'],
      ['Customer support', breakdown.support, 'support'],
      ['Manager escalations', breakdown.manager_escalations, 'cases'],
      ['Admin escalations', breakdown.admin_escalations, 'cases'],
    ];
    panel.innerHTML = `
      <div class="ops-inspector-head"><div><p class="eyebrow">Needs attention</p><h3>Operations queue</h3></div><button type="button" id="opsAttentionClose" class="ops-inspector-close" aria-label="Close attention panel">×</button></div>
      <div class="ops-attention-list">${rows.map(([label, count, view]) => `<button type="button" class="ops-attention-row" data-attention-view="${view}"><span>${esc(label)}</span><b>${Number(count || 0)}</b></button>`).join('')}</div>`;
    panel.hidden = false;
    document.getElementById('opsAttentionClose')?.addEventListener('click', () => { panel.hidden = true; });
    panel.querySelectorAll('[data-attention-view]').forEach(button => {
      button.addEventListener('click', () => {
        stopOpsLiveMap();
        void openView(button.dataset.attentionView);
      });
    });
  }

  function updateSnapshot(next, { fit = false } = {}) {
    snapshot = next || { kpis: {}, entities: [] };
    lastSnapshotAt = Date.now();
    renderKpis();
    reconcileMarkers();
    if (fit) fitInitialMap();
    if (realtimeSocket?.readyState === WebSocket.OPEN) {
      statusLabel('', `Live · synced ${formatAge(snapshot.generated_at)}`);
    }
  }

  async function refreshSnapshot({ fit = false, quiet = false } = {}) {
    if (!isOverviewVisible()) return;
    try {
      const next = await request('/ops/live-map');
      updateSnapshot(next, { fit });
      const error = document.getElementById('opsMapError');
      if (error) error.hidden = true;
    } catch (error) {
      if (!quiet) toast(error.message || 'Live operations could not be refreshed.', true);
      const panel = document.getElementById('opsMapError');
      if (panel) {
        panel.innerHTML = '<strong>Live operations temporarily unavailable</strong>The rest of Ops remains available. Use Refresh to try again.';
        panel.hidden = false;
      }
      statusLabel('offline', 'Live data unavailable');
    }
  }

  function scheduleReconcile(delay) {
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(async () => {
      reconcileTimer = null;
      if (!isOverviewVisible()) return stopOpsLiveMap();
      await refreshSnapshot({ quiet: true });
      const connected = realtimeSocket?.readyState === WebSocket.OPEN;
      scheduleReconcile(connected ? ONLINE_RECONCILE_MS : DISCONNECTED_RECONCILE_MS);
    }, delay);
  }

  function scheduleRealtimeRefresh() {
    if (refreshDebounce) clearTimeout(refreshDebounce);
    refreshDebounce = setTimeout(() => {
      refreshDebounce = null;
      void refreshSnapshot({ quiet: true });
    }, 350);
  }

  function startRealtime(localGeneration) {
    const connect = () => {
      if (localGeneration !== generation || !isOverviewVisible()) return;
      statusLabel('reconnecting', 'Connecting to live network…');
      let socket;
      try {
        socket = new WebSocket(REALTIME_URL, [
          'letsgoride.realtime.v1',
          `letsgoride.auth.${state.token}`,
        ]);
      } catch {
        realtimeRetry = setTimeout(connect, 1800);
        return;
      }
      realtimeSocket = socket;
      socket.onopen = () => {
        if (localGeneration !== generation || realtimeSocket !== socket) return;
        statusLabel('', 'Live');
        scheduleReconcile(ONLINE_RECONCILE_MS);
      };
      socket.onmessage = event => {
        if (localGeneration !== generation || realtimeSocket !== socket || typeof event.data !== 'string') return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!message || typeof message !== 'object') return;
        if (message.type === 'realtime.ready') {
          statusLabel('', 'Live');
          return;
        }
        if (message.type === 'realtime.ping') {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'realtime.pong' }));
          return;
        }
        if (message.event_id && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'realtime.ack', event_id: message.event_id }));
        }
        if (['hailing_trip', 'courier_delivery', 'support_message', 'report', 'ops_case'].includes(message.resource_type)) {
          scheduleRealtimeRefresh();
        }
      };
      socket.onerror = () => undefined;
      socket.onclose = event => {
        if (localGeneration !== generation || realtimeSocket !== socket) return;
        realtimeSocket = null;
        if (event.code === 4401 || event.code === 4403) {
          statusLabel('offline', 'Session expired');
          return;
        }
        if (!isOverviewVisible()) return;
        statusLabel('reconnecting', 'Reconnecting…');
        scheduleReconcile(DISCONNECTED_RECONCILE_MS);
        realtimeRetry = setTimeout(connect, 1800);
      };
    };
    connect();
  }

  function initializeMap() {
    if (!window.L) throw new Error('Map library is unavailable.');
    map = L.map('opsMap', {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView(HARARE_CENTER, 11);
    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    });
    tileLayer.on('tileerror', () => {
      mapFailed = true;
      const error = document.getElementById('opsMapError');
      if (error && !snapshot?.entities?.length) {
        error.innerHTML = '<strong>Map tiles unavailable</strong>Live vehicle data is still protected. Try Refresh shortly.';
        error.hidden = false;
      }
    });
    tileLayer.addTo(map);
  }

  function shellHtml() {
    return `
      <div class="ops-command-center">
        <div id="opsMap" class="ops-live-map" aria-label="Live LetsGoRide operations map"></div>
        <div class="ops-map-toolbar"><strong>Zimbabwe network</strong><span>Live operational presence</span></div>
        <div id="opsKpiRail" class="ops-kpi-rail"></div>
        <div class="ops-map-filterbar" role="group" aria-label="Live map filters">
          <button type="button" class="ops-map-filter active" data-filter="all">All</button>
          <button type="button" class="ops-map-filter" data-filter="drivers">Drivers</button>
          <button type="button" class="ops-map-filter" data-filter="trips">Active trips</button>
          <button type="button" class="ops-map-filter" data-filter="couriers">Couriers</button>
          <button type="button" class="ops-map-filter" data-filter="deliveries">Deliveries</button>
        </div>
        <aside id="opsMapInspector" class="ops-map-inspector" hidden></aside>
        <aside id="opsAttentionPanel" class="ops-attention-panel" hidden></aside>
        <div id="opsMapStatus" class="ops-map-status reconnecting"><span class="ops-map-status-dot"></span><span>Connecting…</span></div>
        <button type="button" id="opsMapCases" class="ops-map-cases">Cases 0</button>
        <div id="opsMapEmpty" class="ops-map-empty" hidden></div>
        <div id="opsMapError" class="ops-map-error" hidden></div>
      </div>`;
  }

  async function renderCommandCenter() {
    stopOpsLiveMap();
    const localGeneration = generation;
    const root = document.getElementById('overviewView');
    root.innerHTML = shellHtml();
    activeFilter = 'all';
    document.querySelectorAll('.ops-map-filter').forEach(button => {
      button.addEventListener('click', () => applyFilter(button.dataset.filter || 'all'));
    });
    document.getElementById('opsMapCases')?.addEventListener('click', () => {
      stopOpsLiveMap();
      void openView('cases');
    });
    try {
      initializeMap();
      await refreshSnapshot({ fit: true });
      if (localGeneration !== generation || !isOverviewVisible()) return;
      startRealtime(localGeneration);
      scheduleReconcile(ONLINE_RECONCILE_MS);
    } catch (error) {
      stopOpsLiveMap();
      if (typeof originalRenderOverview === 'function') {
        await originalRenderOverview();
        const rootAfterFallback = document.getElementById('overviewView');
        rootAfterFallback?.insertAdjacentHTML('afterbegin', '<div class="error">Live map is temporarily unavailable. The standard Operations overview is still available.</div>');
      }
    }
  }

  window.renderOverview = renderCommandCenter;

  document.getElementById('nav')?.addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (button && button.dataset.view !== 'overview') stopOpsLiveMap();
  }, true);
  document.getElementById('logoutBtn')?.addEventListener('click', stopOpsLiveMap, true);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isOverviewVisible()) {
      void refreshSnapshot({ quiet: true });
    }
  });
})();
