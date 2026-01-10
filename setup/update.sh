#!/bin/bash
#
# KAK Cup - Update Script
#
# This script updates the KAK Cup application to the latest version.
#
# Usage: sudo ./update.sh
#

set -e

# Configuration
APP_NAME="kakcup"
APP_DIR="/opt/kakcup"
APP_USER="kakcup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (use sudo)"
    exit 1
fi

# Check if app is installed
if [ ! -d "$APP_DIR" ]; then
    log_error "KAK Cup is not installed at $APP_DIR"
    log_error "Run install.sh first"
    exit 1
fi

log_info "Updating KAK Cup..."

# Backup database
log_info "Backing up database..."
BACKUP_PATH="$APP_DIR/kakcup.db.backup.$(date +%Y%m%d_%H%M%S)"
cp "$APP_DIR/kakcup.db" "$BACKUP_PATH"
chown "$APP_USER:$APP_USER" "$BACKUP_PATH"
log_info "Database backed up to: $BACKUP_PATH"

# Stop the service
log_info "Stopping the service..."
systemctl stop "$APP_NAME"

# Pull latest changes
log_info "Pulling latest changes from git..."
cd "$APP_DIR"
sudo -u "$APP_USER" git fetch origin
sudo -u "$APP_USER" git reset --hard origin/main

# Install dependencies (in case they changed)
log_info "Installing dependencies..."
sudo -u "$APP_USER" npm install

# Rebuild the application
log_info "Rebuilding the application..."
sudo -u "$APP_USER" npm run build

# Start the service
log_info "Starting the service..."
systemctl start "$APP_NAME"

# Wait and check status
sleep 3
if systemctl is-active --quiet "$APP_NAME"; then
    log_info "Update completed successfully!"
    echo ""
    echo "The application has been updated and restarted."
    echo "Database backup: $BACKUP_PATH"
    echo ""
else
    log_error "Service failed to start after update!"
    log_warn "Restoring database backup..."
    cp "$BACKUP_PATH" "$APP_DIR/kakcup.db"
    systemctl start "$APP_NAME"
    log_error "Check logs with: journalctl -u $APP_NAME"
    exit 1
fi
