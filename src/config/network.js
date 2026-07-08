// Presence WebSocket endpoint. The EC2 backend is a spot instance whose IP
// can change; this domain is kept pointed at it by server/deploy/update-dns.sh
// (Cloudflare DNS, proxied — Cloudflare terminates the wss:// TLS for us).
export const WS_URL = 'wss://ws.bruno-rodriguez-mendez.com';
