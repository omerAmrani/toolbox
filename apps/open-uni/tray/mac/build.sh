#!/bin/bash
set -e
cd "$(dirname "$0")"

swift build -c release

APP="$HOME/Applications/OpenUniRecorder.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp .build/release/OpenUniRecorderTray "$APP/Contents/MacOS/OpenUniRecorder"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>OpenUniRecorder</string>
    <key>CFBundleIdentifier</key><string>com.open-uni-recorder.tray</string>
    <key>CFBundleName</key><string>OpenUniRecorder</string>
    <key>CFBundleVersion</key><string>1.0</string>
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>LSUIElement</key><true/>
    <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict>
</plist>
EOF

echo "Built $APP"
echo "This is an unsigned local build — first launch needs Finder: right-click OpenUniRecorder.app -> Open, then confirm."
