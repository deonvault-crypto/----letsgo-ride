export class RealtimeRoom {
  constructor(context) {
    this.context = context;
    this.context.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/socket' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const { 0: client, 1: server } = new WebSocketPair();
      this.context.acceptWebSocket(server);
      server.send(JSON.stringify({ type: 'realtime.ready' }));
      return new Response(null, { status: 101, webSocket: client, headers: {
        'Sec-WebSocket-Protocol': 'letsgoride.realtime.v1',
      } });
    }
    if (pathname === '/publish' && request.method === 'POST') {
      const envelope = await request.text();
      for (const socket of this.context.getWebSockets()) {
        if (socket.readyState === WebSocket.OPEN) socket.send(envelope);
      }
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }
}
