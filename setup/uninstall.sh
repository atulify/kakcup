#!/bin/bash
#
# KAK Cup - Raspberry Pi Uninstallation Script
#
# This script removes the KAK Cup application and its systemd service.
#
# Usage: sudo ./uninstall.sh
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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Please run as root (use sudo)"
    exit 1
fi

echo ""
echo -e "${YELLOW}WARNING: This will remove the KAK Cup application.${NC}"
echo ""
read -p "Do you want to keep the database? (y/n): " KEEP_DB
read -p "Are you sure you want to continue? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Uninstallation cancelled."
    exit 0
fi

# Stop and disable the service
log_info "Stopping and disabling the service..."
systemctl stop "$APP_NAME" 2>/dev/null || true
systemctl disable "$APP_NAME" 2>/dev/null || true

# Remove systemd service file
log_info "Removing systemd service..."
rm -f /etc/systemd/system/${APP_NAME}.service
systemctl daemon-reload

# Remove logrotate config
log_info "Removing logrotate configuration..."
rm -f /etc/logrotate.d/${APP_NAME}

# Backup database if requested
if [ "$KEEP_DB" = "y" ] || [ "$KEEP_DB" = "Y" ]; then
    if [ -f "$APP_DIR/kakcup.db" ]; then
        BACKUP_PATH="/home/$SUDO_USER/kakcup.db.backup"
        log_info "Backing up database to $BACKUP_PATH..."
        cp "$APP_DIR/kakcup.db" "$BACKUP_PATH"
        chown "$SUDO_USER:$SUDO_USER" "$BACKUP_PATH"
    fi
fi

# Remove application directory
log_info "Removing application directory..."
rm -rf "$APP_DIR"

# Remove application user (optional)
read -p "Remove the $APP_USER system user? (y/n): " REMOVE_USER
if [ "$REMOVE_USER" = "y" ] || [ "$REMOVE_USER" = "Y" ]; then
    log_info "Removing application user..."
    userdel -r "$APP_USER" 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}KAK Cup has been uninstalled.${NC}"
if [ "$KEEP_DB" = "y" ] || [ "$KEEP_DB" = "Y" ]; then
    echo "Database backup saved to: $BACKUP_PATH"
fi
echo ""
