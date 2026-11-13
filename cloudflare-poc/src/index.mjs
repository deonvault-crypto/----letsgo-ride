/**
 * LetsGoRide migration laboratory, NOT the LetsGoRide production API.
 * No auth, ride, payout, support or merchant endpoints are implemented here.
 * Deliberately fails closed until data and backend capabilities are migrated.
 */
const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-LetsGoRide-Prototype': 'true',
};

function response(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...extra },
  });
}

export default {
  async fetch(request, env) {
    let path;
    try {
      path = new URL(request.url).pathname;
    } catch {
      return response(400, { success: false, error: 'Invalid request URL' });
    }

    if (request.method === 'GET' && path === '/health/live') {
      return response(200, {
        success: true,
        data: { service: 'LetsGoRide Cloudflare migration prototype', status: 'alive', production_ready: false },
      });
    }

    if (request.method === 'GET' && path === '/health/ready') {
      let databaseStatus = 'not_configured';
      if (env?.DB && typeof env.DB.prepare === 'function') {
        try {
          const row = await env.DB.prepare('SELECT 1 AS connected').first();
          databaseStatus = row?.connected === 1 ? 'connected' : 'unavailable';
        } catch {
          databaseStatus = 'unavailable';
        }
      }
      // A working D1 connection is not equivalent to a migrated ride platform.
      return response(503, {
        success: false,
        data: {
          service: 'LetsGoRide Cloudflare migration prototype',
          status: 'blocked',
          database_status: databaseStatus,
          production_ready: false,
          reason: 'production_data_and_business_workflows_not_migrated',
        },
      }, { 'Retry-After': '3600' });
    }

    // Do not implement real-app routes until authenticated API, safety, payment,
    // dispatch and idempotency contract tests have passed. No default data writes.
    return response(503, {
      success: false,
      error: 'Migration prototype only. Production API is not available here.',
    }, { 'Retry-After': '3600' });
  },
};
