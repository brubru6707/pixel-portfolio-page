#!/usr/bin/env bash
# Certbot deploy-hook: /etc/letsencrypt/live/*/privkey.pem is root-only, and
# the presence server intentionally does NOT run as root, so this copies the
# renewed cert/key to a location ec2-user can read and restarts the service.
# Installed at /etc/letsencrypt/renewal-hooks/deploy/copy-certs.sh — certbot
# runs everything in that directory automatically after a successful renewal.
set -euo pipefail

SRC=/etc/letsencrypt/live/ws.bruno-rodriguez-mendez.com
DEST=/home/ec2-user/app/server/certs

install -d -o ec2-user -g ec2-user -m 700 "$DEST"
install -o ec2-user -g ec2-user -m 600 "$SRC/fullchain.pem" "$DEST/fullchain.pem"
install -o ec2-user -g ec2-user -m 600 "$SRC/privkey.pem" "$DEST/privkey.pem"

systemctl restart presence-server
