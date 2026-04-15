#!/bin/bash
# YouTubeMinus privileged daemon install script.
# Must be run as root (called via AppleScript "with administrator privileges").
#
# After this script completes the daemon lives entirely in /Library — it has
# no runtime dependency on the app bundle.  Deleting YouTubeMinus.app does NOT
# stop the daemon.  Removing it requires Jenna's password through the app.
set -euo pipefail

HELPER_SRC="${1:?Usage: install.sh <helper_binary_path> <plist_path>}"
PLIST_SRC="${2:?}"

HELPER_DEST="/Library/PrivilegedHelperTools/YouTubeMinusHelper"
PLIST_DEST="/Library/LaunchDaemons/com.youtubeminus.helper.plist"
SUPPORT_DIR="/Library/Application Support/YouTubeMinus"
LOG_FILE="/Library/Logs/YouTubeMinusHelper.log"

echo "[install] Installing YouTubeMinusHelper as an independent system daemon…"

# ── Support directory ─────────────────────────────────────────────────────────
mkdir -p "$SUPPORT_DIR"
chmod 755 "$SUPPORT_DIR"
chown root:wheel "$SUPPORT_DIR"

# ── Binary ────────────────────────────────────────────────────────────────────
mkdir -p /Library/PrivilegedHelperTools
cp -f "$HELPER_SRC" "$HELPER_DEST"
chmod 755 "$HELPER_DEST"
chown root:wheel "$HELPER_DEST"

# ── Plist ─────────────────────────────────────────────────────────────────────
cp -f "$PLIST_SRC" "$PLIST_DEST"
chmod 644 "$PLIST_DEST"
chown root:wheel "$PLIST_DEST"

# ── Log file ──────────────────────────────────────────────────────────────────
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"
chown root:wheel "$LOG_FILE"

# ── Load daemon ───────────────────────────────────────────────────────────────
/bin/launchctl bootout system "$PLIST_DEST" 2>/dev/null || true
/bin/launchctl bootstrap system "$PLIST_DEST"

echo "[install] Done."
echo "[install] Binary:  $HELPER_DEST"
echo "[install] Daemon:  $PLIST_DEST"
echo "[install] Support: $SUPPORT_DIR"
echo "[install] The daemon will continue enforcing even if the app is deleted."
