(() => {
  if (!window.L?.Map) return;

  // Zimbabwe-first framing for the internal Ops map only. The live-map module
  // remains the source of truth for markers and realtime data; this guard only
  // prevents the camera from opening at a Southern Africa scale or being pulled
  // far away by one anomalous coordinate.
  const ZIMBABWE_BOUNDS = L.latLngBounds(
    [-22.45, 25.15],
    [-15.55, 33.10],
  );
  const ZIMBABWE_OPERATION_ENVELOPE = L.latLngBounds(
    [-23.10, 24.50],
    [-14.90, 33.75],
  );
  const DEFAULT_PADDING = [34, 34];
  const MIN_USEFUL_LIVE_ZOOM = 7;

  const originalSetView = L.Map.prototype.setView;
  const originalFitBounds = L.Map.prototype.fitBounds;

  function isOpsMap(instance) {
    return instance?.getContainer?.()?.id === 'opsMap';
  }

  function isZimbabweOverviewRequest(center, zoom) {
    const point = L.latLng(center);
    return Number(zoom) <= 6
      && Math.abs(point.lat - (-19.0154)) < 0.05
      && Math.abs(point.lng - 29.1549) < 0.05;
  }

  function useZimbabweOverview(instance, options = {}) {
    return originalFitBounds.call(instance, ZIMBABWE_BOUNDS, {
      padding: DEFAULT_PADDING,
      maxZoom: 8,
      animate: options.animate,
    });
  }

  L.Map.prototype.setView = function setViewWithOpsGuard(center, zoom, options) {
    if (isOpsMap(this) && isZimbabweOverviewRequest(center, zoom)) {
      return useZimbabweOverview(this, options || {});
    }
    return originalSetView.call(this, center, zoom, options);
  };

  L.Map.prototype.fitBounds = function fitBoundsWithOpsGuard(bounds, options = {}) {
    if (!isOpsMap(this)) return originalFitBounds.call(this, bounds, options);

    const target = L.latLngBounds(bounds);
    if (!target.isValid()) return useZimbabweOverview(this, options);

    const southWest = target.getSouthWest();
    const northEast = target.getNorthEast();
    const envelopeSouthWest = ZIMBABWE_OPERATION_ENVELOPE.getSouthWest();
    const envelopeNorthEast = ZIMBABWE_OPERATION_ENVELOPE.getNorthEast();
    const outsideOperationalEnvelope = southWest.lat < envelopeSouthWest.lat
      || southWest.lng < envelopeSouthWest.lng
      || northEast.lat > envelopeNorthEast.lat
      || northEast.lng > envelopeNorthEast.lng;

    if (outsideOperationalEnvelope) {
      return useZimbabweOverview(this, options);
    }

    // A single bad-but-nearby coordinate should never drag the command center
    // out to a country-scale view. Local clusters still auto-fit normally.
    const padding = L.point(
      Number(options.padding?.[0] ?? 70),
      Number(options.padding?.[1] ?? 70),
    );
    const targetZoom = this.getBoundsZoom(target, false, padding);
    if (Number.isFinite(targetZoom) && targetZoom < MIN_USEFUL_LIVE_ZOOM) {
      return useZimbabweOverview(this, options);
    }

    return originalFitBounds.call(this, target, options);
  };
})();
