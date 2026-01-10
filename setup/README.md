# KAK Cup - Raspberry Pi Setup

Scripts for deploying KAK Cup on a Raspberry Pi.

## Requirements

- Raspberry Pi 3/4/5 (or any ARM-based Pi)
- Raspberry Pi OS (Debian-based)
- Internet connection
- SSH access (recommended)

## Quick Start

SSH into your Raspberry Pi and run:

```bash
# Download the install script
curl -fsSL https://raw.githubusercontent.com/atulify/kakcup/main/setup/install.sh -o install.sh

# Make it executable and run
chmod +x install.sh
sudo ./install.sh
```

Or clone the repo first:

```bash
git clone https://github.com/atulify/kakcup.git
cd kakcup/setup
sudo ./install.sh
```

## Scripts

### install.sh

Full installation script that:
- Installs Node.js 20 LTS
- Installs build dependencies
- Creates a dedicated `kakcup` system user
- Clones the repository to `/opt/kakcup`
- Installs npm dependencies
- Runs database migration
- Builds the production bundle
- Creates a systemd service for auto-start
- Configures log rotation

### update.sh

Updates to the latest version:
- Backs up the database
- Pulls latest code from git
- Reinstalls dependencies
- Rebuilds the application
- Restarts the service

### uninstall.sh

Removes the application:
- Stops and removes the systemd service
- Optionally backs up the database
- Removes application files
- Optionally removes the system user

## Service Management

```bash
# Check status
sudo systemctl status kakcup

# View logs
sudo journalctl -u kakcup -f

# Restart
sudo systemctl restart kakcup

# Stop
sudo systemctl stop kakcup

# Start
sudo systemctl start kakcup
```

## Configuration

Environment variables are stored in `/opt/kakcup/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port to listen on |
| `NODE_ENV` | `production` | Node environment |
| `SESSION_SECRET` | (auto-generated) | Session encryption key |

To modify, edit the file and restart:

```bash
sudo nano /opt/kakcup/.env
sudo systemctl restart kakcup
```

## File Locations

| Path | Description |
|------|-------------|
| `/opt/kakcup` | Application directory |
| `/opt/kakcup/.env` | Environment configuration |
| `/opt/kakcup/kakcup.db` | SQLite database |
| `/etc/systemd/system/kakcup.service` | Systemd service file |
| `/etc/logrotate.d/kakcup` | Log rotation config |

## Accessing the App

After installation, the app runs at:
- `http://<raspberry-pi-ip>:3000`

Find your Pi's IP with:
```bash
hostname -I
```

## Exposing Publicly (Optional)

To expose the app to the internet safely, use Cloudflare Tunnel:

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate (requires Cloudflare account + domain)
cloudflared tunnel login
cloudflared tunnel create kakcup
cloudflared tunnel route dns kakcup kakcup.yourdomain.com

# Run the tunnel
cloudflared tunnel run --url http://localhost:3000 kakcup
```

## Troubleshooting

### Service won't start
```bash
sudo journalctl -u kakcup -n 50 --no-pager
```

### Database issues
```bash
# Re-run migration
cd /opt/kakcup
sudo -u kakcup npm run db:migrate
```

### Permission issues
```bash
sudo chown -R kakcup:kakcup /opt/kakcup
```

### Rebuild native modules
```bash
cd /opt/kakcup
sudo -u kakcup npm rebuild
```
