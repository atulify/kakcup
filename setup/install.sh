#!/bin/bash
#
# KAK Cup - Raspberry Pi Installation Script
#
# This script installs and configures the KAK Cup application
# to run as a systemd service on Raspberry Pi OS.
#
# Usage: sudo ./install.sh
#

set -e

# Configuration
APP_NAME="kakcup"
APP_DIR="/opt/kakcup"
APP_USER="kakcup"
APP_PORT=3000
NODE_VERSION="20"
REPO_URL="https://github.com/atulify/kakcup.git"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Check if running on Raspberry Pi / Debian-based system
if ! command -v apt &> /dev/null; then
    log_error "This script is designed for Debian-based systems (Raspberry Pi OS)"
    exit 1
fi

log_info "Starting KAK Cup installation..."

# Step 1: Update system packages
log_info "Updating system packages..."
apt update && apt upgrade -y

# Step 2: Install build dependencies
log_info "Installing build dependencies..."
apt install -y curl git build-essential python3

# Step 3: Install Node.js
if command -v node &> /dev/null; then
    CURRENT_NODE=$(node -v)
    log_info "Node.js already installed: $CURRENT_NODE"
else
    log_info "Installing Node.js v${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
fi

log_info "Node.js version: $(node -v)"
log_info "npm version: $(npm -v)"

# Step 4: Create application user
if id "$APP_USER" &>/dev/null; then
    log_info "User $APP_USER already exists"
else
    log_info "Creating application user: $APP_USER"
    useradd --system --create-home --shell /bin/bash "$APP_USER"
fi

# Step 5: Clone or update repository
if [ -d "$APP_DIR" ]; then
    log_info "Application directory exists, pulling latest changes..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git pull || true
else
    log_info "Cloning repository to $APP_DIR..."
    git clone "$REPO_URL" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

cd "$APP_DIR"

# Step 6: Install npm dependencies
log_info "Installing npm dependencies (this may take a few minutes on Pi)..."
sudo -u "$APP_USER" npm install

# Step 7: Run database migration
log_info "Running database migration..."
sudo -u "$APP_USER" npm run db:migrate

# Step 8: Build the application
log_info "Building the application..."
sudo -u "$APP_USER" npm run build

# Step 9: Create environment file
log_info "Creating environment configuration..."
cat > "$APP_DIR/.env" << EOF
NODE_ENV=production
PORT=$APP_PORT
SESSION_SECRET=$(openssl rand -hex 32)
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# Step 10: Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=KAK Cup Web Application
Documentation=https://github.com/atulify/kakcup
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/dist/index.js
Restart=on-failure
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$APP_NAME

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Step 11: Configure log rotation
log_info "Configuring log rotation..."
cat > /etc/logrotate.d/${APP_NAME} << EOF
/var/log/${APP_NAME}/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 $APP_USER $APP_USER
    sharedscripts
    postrotate
        systemctl reload $APP_NAME > /dev/null 2>&1 || true
    endscript
}
EOF

# Step 12: Enable and start the service
log_info "Enabling and starting the service..."
systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl start "$APP_NAME"

# Wait for service to start
sleep 3

# Check service status
if systemctl is-active --quiet "$APP_NAME"; then
    log_info "Service started successfully!"
else
    log_error "Service failed to start. Check logs with: journalctl -u $APP_NAME"
    exit 1
fi

# Get the Pi's IP address
PI_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "=============================================="
echo -e "${GREEN}KAK Cup Installation Complete!${NC}"
echo "=============================================="
echo ""
echo "The application is now running at:"
echo "  http://${PI_IP}:${APP_PORT}"
echo "  http://localhost:${APP_PORT}"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status $APP_NAME   - Check service status"
echo "  sudo systemctl restart $APP_NAME  - Restart the service"
echo "  sudo systemctl stop $APP_NAME     - Stop the service"
echo "  sudo journalctl -u $APP_NAME -f   - View live logs"
echo ""
echo "Configuration files:"
echo "  App directory:    $APP_DIR"
echo "  Environment:      $APP_DIR/.env"
echo "  Service file:     /etc/systemd/system/${APP_NAME}.service"
echo "  Database:         $APP_DIR/kakcup.db"
echo ""
