#!/bin/bash
cd /home/atsushi/site
git pull origin main
sudo systemctl reload caddy
echo "$(date): Deployed successfully" >> /var/log/deploy.log
