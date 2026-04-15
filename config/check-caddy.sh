#!/bin/bash
if ! systemctl is-active --quiet caddy; then
    sudo systemctl restart caddy
    echo "$(date): Caddy restarted" >> /var/log/caddy-health.log
fi
