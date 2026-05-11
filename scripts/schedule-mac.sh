#!/bin/bash
# schedule-mac.sh
# Installs a launchd agent to run wallet-daily every morning at 8:00 AM.
# Usage: bash scripts/schedule-mac.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUN_PATH="$(which bun 2>/dev/null || echo '')"
LABEL="com.wallet-daily.budget"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/wallet-daily"

if [ -z "$BUN_PATH" ]; then
  echo "Error: bun not found. Install from https://bun.sh"
  exit 1
fi

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "Error: .env not found at $PROJECT_DIR/.env"
  echo "Copy .env.example and fill in your values first."
  exit 1
fi

mkdir -p "$LOG_DIR"

# Parse .env into launchd EnvironmentVariables dict
ENV_VARS=""
while IFS='=' read -r key value; do
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  value="${value%%#*}"    # strip inline comments
  value="${value//[[:space:]]/}"  # strip whitespace
  key="${key//[[:space:]]/}"
  ENV_VARS+="        <key>$key</key>
        <string>$value</string>
"
done < "$PROJECT_DIR/.env"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BUN_PATH</string>
        <string>run</string>
        <string>$PROJECT_DIR/src/daily.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
$ENV_VARS    </dict>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/daily.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/daily.error.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

# Unload if already registered
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✓ Installed launchd agent: $LABEL"
echo "  Runs daily at 08:00 AM"
echo "  Logs: $LOG_DIR/"
echo ""
echo "To run immediately: launchctl start $LABEL"
echo "To remove:          launchctl unload $PLIST && rm $PLIST"
