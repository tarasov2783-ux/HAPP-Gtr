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

log "Environment ready!"

# Production server check
if [ -f "gunicorn" ]; then
    log "Production mode with gunicorn"
    CMD="gunicorn server:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:3000 --daemon --pid gunicorn.pid"
else
    CMD="uvicorn server:app --host 0.0.0.0 --port 3000 --reload"
fi

# Create systemd service
SERVICE_FILE="/etc/systemd/system/happ-generator.service"
if command -v systemctl >/dev/null 2>&1; then
    log "Creating systemd service..."
    sudo bash -c "cat > $SERVICE_FILE" << EOF
[Unit]
Description=HAPP Generator
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$DIR
Environment=PATH=$DIR/.venv/bin
ExecStart=$DIR/.venv/bin/$CMD
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
    exec $CMD
fi

log "✅ Installation complete!"
log "🌐 Open: http://localhost:3000"
log "👨‍💻 Admin: http://localhost:3000/admin.html (admin/changeme123)"
log "🔧 Stop: sudo systemctl stop happ-generator"
log "🔄 Restart: sudo systemctl restart happ-generator"
log "📊 Status: sudo systemctl status happ-generator"
