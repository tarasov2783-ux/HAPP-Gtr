#!/bin/bash
set -e

# Colors
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
NC="\033[0m"

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log "=== HAPP Generator Auto Installer ==="

# Check dependencies
command -v git >/dev/null 2>&1 || { error "git required"; exit 1; }
command -v python3 >/dev/null 2>&1 || { error "python3 required"; exit 1; }
command -v curl >/dev/null 2>&1 || { error "curl required"; exit 1; }
command -v sudo >/dev/null 2>&1 || warn "sudo not found (systemd may fail)"

DIR="$HOME/happ-generator"
log "Installing to $DIR"

# Clone repo
if [ -d "$DIR" ]; then
    log "Using existing $DIR"
    cd "$DIR"
    git pull origin main
else
    log "Cloning repository..."
    git clone https://github.com/tarasov2783-ux/HAPP-Generator.git "$DIR"
    cd "$DIR"
fi

# Setup Python
log "Setting up Python environment..."
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Install additional dependencies for 3x-ui integration
log "Installing additional dependencies..."
pip install requests uvicorn gunicorn 2>/dev/null || true

log "Environment ready!"

# Create default servers_config.json if not exists
if [ ! -f "servers_config.json" ]; then
    log "Creating default servers_config.json..."
    cat > servers_config.json << 'EOF'
{
  "servers": [
    {
      "id": "server1",
      "name": "Основной сервер",
      "address": "https://your-domain.com:54321",
      "sub_url": "https://your-domain.com:2096/sublink",
      "username": "admin",
      "password": "your-password",
      "defaultTrafficGB": 100,
      "defaultExpiryDays": 30
    }
  ]
}
EOF
    warn "Please edit servers_config.json with your actual server settings!"
fi

# Create db.json if not exists
if [ ! -f "db.json" ]; then
    log "Creating empty db.json..."
    echo '{"links": []}' > db.json
fi

# Create admin_users.json if not exists
if [ ! -f "admin_users.json" ]; then
    log "Creating default admin user..."
    cat > admin_users.json << 'EOF'
{
  "users": [
    {
      "id": "admin",
      "username": "admin",
      "password_hash": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      "role": "admin",
      "created_at": "2025-01-01T00:00:00"
    }
  ]
}
EOF
fi

# Create stats_monthly.json if not exists
if [ ! -f "stats_monthly.json" ]; then
    log "Creating empty stats_monthly.json..."
    echo '{"monthly": []}' > stats_monthly.json
fi

# Determine Python path for service
UVICORN_PATH="$DIR/.venv/bin/uvicorn"

# Create systemd service
SERVICE_FILE="/etc/systemd/system/happ-generator.service"
if command -v systemctl >/dev/null 2>&1; then
    log "Creating systemd service..."
    
    # Stop existing service if running
    sudo systemctl stop happ-generator 2>/dev/null || true
    
    sudo bash -c "cat > $SERVICE_FILE" << EOF
[Unit]
Description=HAPP Generator with 3x-UI Integration
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$DIR
Environment="PATH=$DIR/.venv/bin"
Environment="ADMIN_USER=admin"
Environment="ADMIN_PASS=changeme123"
ExecStart=$UVICORN_PATH server:app --host 0.0.0.0 --port 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable happ-generator
    sudo systemctl start happ-generator

    log "Systemd service created and started!"
    log "Status: sudo systemctl status happ-generator"
    log "Logs: sudo journalctl -u happ-generator -f"
else
    warn "No systemd, starting manually..."
    $UVICORN_PATH server:app --host 0.0.0.0 --port 3000 &
fi

# Check if service is running
sleep 3
if command -v systemctl >/dev/null 2>&1; then
    if sudo systemctl is-active --quiet happ-generator; then
        log "✅ Service is running!"
    else
        warn "⚠️ Service may have issues. Check with: sudo systemctl status happ-generator"
    fi
fi

log ""
log "✅ Installation complete!"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "🌐 Open: http://localhost:3000"
log "👨‍💻 Admin panel: http://localhost:3000/happ/admin.html"
log "🔐 Admin credentials: admin / changeme123"
log ""
log "📁 Configuration files:"
log "   - servers_config.json - edit this to add your 3x-UI servers"
log "   - db.json - database of created links"
log "   - admin_users.json - admin users"
log "   - stats_monthly.json - monthly statistics"
log ""
log "🔧 Useful commands:"
log "   sudo systemctl status happ-generator  - check service status"
log "   sudo systemctl restart happ-generator - restart service"
log "   sudo systemctl stop happ-generator     - stop service"
log "   sudo journalctl -u happ-generator -f   - view logs"
log ""
log "⚠️  IMPORTANT:"
log "   1. Edit servers_config.json with your 3x-UI server details"
log "   2. Change default admin password in admin_users.json or through admin panel"
log "   3. Make sure your 3x-UI panel is accessible from this server"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
