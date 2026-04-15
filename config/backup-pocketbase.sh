#!/bin/bash

# Load env variables
source ~/.env

# Copy database
cp /home/atsushi/pocketbase/pb_data/data.db /home/atsushi/backups/data-$(date +%Y%m%d).db

# Push to GitHub backup repo
cd /home/atsushi/backup-repo
cp /home/atsushi/backups/data-$(date +%Y%m%d).db .
git add .
git commit -m "Backup $(date +%Y-%m-%d)"
git push origin main

# Delete local backups older than 30 days
find /home/atsushi/backups/ -type f -mtime +30 -delete

echo "$(date): Backup completed" >> /var/log/pb-backup.log

