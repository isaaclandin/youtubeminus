#!/bin/bash
# Uninstall script — run by Jenna when intentionally removing the system.
# Requires admin; called via AppleScript after password verification.
set -euo pipefail

PLIST="/Library/LaunchDaemons/com.youtubeminus.helper.plist"
HELPER="/Library/PrivilegedHelperTools/YouTubeMinusHelper"
CHROME_POLICY="/Library/Managed Preferences/com.google.Chrome.plist"

echo "[uninstall] Removing YouTubeMinus enforcement…"

# Unload daemon
/bin/launchctl bootout system "$PLIST" 2>/dev/null || true

# Remove files
rm -f "$PLIST" "$HELPER" "$CHROME_POLICY"

# Restore system DNS to automatic (DHCP-provided) on all interfaces
networksetup -listallnetworkservices | tail -n +2 | while IFS= read -r svc; do
    svc="${svc#\*}"  # strip leading asterisk for disabled services
    networksetup -setdnsservers "$svc" "Empty" 2>/dev/null || true
done

echo "[uninstall] Done."
