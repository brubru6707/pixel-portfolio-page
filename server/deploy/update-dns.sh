#!/usr/bin/env bash
# Keeps a Cloudflare DNS A record pointed at this EC2 instance's current
# public IP. Meant to run on the instance itself, at boot (see
# presence-ddns.service) — a fresh Spot replacement counts as a boot, so this
# self-heals without needing to know about instance/IP changes in advance.
#
# Requires CF_API_TOKEN in the environment (Zone:DNS:Edit + Zone:Zone:Read,
# scoped to the one zone). Never hardcode the token here or commit it —
# it's meant to live in /etc/presence-ddns.env on the instance (0600, root-only).
set -uo pipefail

ZONE_NAME="${CF_ZONE_NAME:-bruno-rodriguez-mendez.com}"
RECORD_NAME="${CF_RECORD_NAME:-ws.bruno-rodriguez-mendez.com}"
CF_API="https://api.cloudflare.com/client/v4"

log() { echo "[update-dns] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }

if [[ -z "${CF_API_TOKEN:-}" ]]; then
    log "ERROR: CF_API_TOKEN is not set (expected in /etc/presence-ddns.env)"
    exit 1
fi

AUTH_HEADER="Authorization: Bearer ${CF_API_TOKEN}"

# --- current public IP, via IMDSv2 (token-gated instance metadata) ---
IMDS_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
if [[ -z "$IMDS_TOKEN" ]]; then
    log "ERROR: could not fetch IMDSv2 token"
    exit 1
fi
CURRENT_IP=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
    "http://169.254.169.254/latest/meta-data/public-ipv4")
if [[ -z "$CURRENT_IP" ]]; then
    log "ERROR: could not fetch public IPv4 from instance metadata"
    exit 1
fi
log "current public IP: $CURRENT_IP"

# --- resolve zone id (token is scoped to one zone, so this returns exactly it) ---
ZONE_RESP=$(curl -sf -X GET "${CF_API}/zones?name=${ZONE_NAME}" -H "$AUTH_HEADER" -H "Content-Type: application/json")
ZONE_ID=$(echo "$ZONE_RESP" | grep -o '"id":"[a-f0-9]*"' | head -1 | cut -d'"' -f4)
if [[ -z "$ZONE_ID" ]]; then
    log "ERROR: could not resolve zone id for $ZONE_NAME. Response: $ZONE_RESP"
    exit 1
fi

# --- find existing A record for the subdomain, if any ---
RECORD_RESP=$(curl -sf -X GET "${CF_API}/zones/${ZONE_ID}/dns_records?type=A&name=${RECORD_NAME}" -H "$AUTH_HEADER" -H "Content-Type: application/json")
RECORD_ID=$(echo "$RECORD_RESP" | grep -o '"id":"[a-f0-9]*"' | head -1 | cut -d'"' -f4)
EXISTING_IP=$(echo "$RECORD_RESP" | grep -o '"content":"[0-9.]*"' | head -1 | cut -d'"' -f4)

if [[ -n "$RECORD_ID" && "$EXISTING_IP" == "$CURRENT_IP" ]]; then
    log "record already up to date ($RECORD_NAME -> $CURRENT_IP), nothing to do"
    exit 0
fi

BODY=$(cat <<JSON
{"type":"A","name":"${RECORD_NAME}","content":"${CURRENT_IP}","ttl":60,"proxied":true}
JSON
)

if [[ -n "$RECORD_ID" ]]; then
    log "updating existing record $RECORD_ID ($EXISTING_IP -> $CURRENT_IP)"
    RESULT=$(curl -sf -X PUT "${CF_API}/zones/${ZONE_ID}/dns_records/${RECORD_ID}" \
        -H "$AUTH_HEADER" -H "Content-Type: application/json" --data "$BODY")
else
    log "creating new record $RECORD_NAME -> $CURRENT_IP"
    RESULT=$(curl -sf -X POST "${CF_API}/zones/${ZONE_ID}/dns_records" \
        -H "$AUTH_HEADER" -H "Content-Type: application/json" --data "$BODY")
fi

if echo "$RESULT" | grep -q '"success":true'; then
    log "done"
    exit 0
else
    log "ERROR: Cloudflare API call failed: $RESULT"
    exit 1
fi
