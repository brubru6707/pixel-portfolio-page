// Presence WebSocket endpoint. The EC2 backend is a spot instance whose IP
// can change; this domain is kept pointed at it by server/deploy/update-dns.sh
// (Cloudflare DNS, proxied — Cloudflare terminates the wss:// TLS for us).
export const WS_URL = 'wss://ws.bruno-rodriguez-mendez.com';

// Same origin/box, plain HTTPS — serves the rolling 24h visitor stats (see
// server/index.js's GET /stats handler).
export const STATS_URL = 'https://ws.bruno-rodriguez-mendez.com/stats';
