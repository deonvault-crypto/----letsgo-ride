import { acceptOffer, claimEvent, completeEvent, expireOffers, nearbyDrivers, reserveOffer } from '../../src/hailing-lab.mjs';
import { recordCapture } from '../../src/finance-lab.mjs';
export { RealtimeRoom } from '../../src/realtime-lab.mjs';

// Loaded by Miniflare tests only. Never referenced by a Wrangler deployment.
const operations = {
  nearby: (db, input) => nearbyDrivers(db, input),
  reserve: (db, input) => reserveOffer(db, input),
  expire: (db, input) => expireOffers(db, input.now),
  accept: (db, input) => acceptOffer(db, input),
  claim: (db, input) => claimEvent(db, input),
  complete: (db, input) => completeEvent(db, input),
  capture: (db, input) => recordCapture(db, input),
};

const sessions = new Map([
  ['test-passenger-session', 'test-passenger'],
  ['test-driver-session', 'test-driver'],
]);

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'POST' && Object.hasOwn(operations, pathname.slice(1))) {
      return Response.json(await operations[pathname.slice(1)](env.DB, await request.json()));
    }
    if (pathname === '/realtime') {
      const protocols = request.headers.get('sec-websocket-protocol')?.split(',').map(value => value.trim()) ?? [];
      const token = protocols.find(value => value.startsWith('letsgoride.auth.'))?.slice('letsgoride.auth.'.length);
      const userId = sessions.get(token);
      if (!userId || !protocols.includes('letsgoride.realtime.v1')) return new Response(null, { status: 401 });
      const room = env.REALTIME.get(env.REALTIME.idFromName(userId));
      return room.fetch('https://realtime.lab/socket', { headers: { Upgrade: 'websocket' } });
    }
    if (pathname === '/fixture-publish' && request.method === 'POST') {
      const { userId, envelope } = await request.json();
      const room = env.REALTIME.get(env.REALTIME.idFromName(userId));
      return room.fetch('https://realtime.lab/publish', { method: 'POST', body: JSON.stringify(envelope) });
    }
    return new Response(null, { status: 404 });
  },
};
