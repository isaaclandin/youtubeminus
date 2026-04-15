# YouTubeMinus — macOS Enforcer

Menu-bar app + privileged daemon that blocks YouTube on every browser
except Chrome. Chrome is the only sanctioned YouTube surface because it
is the only browser where the accountability extension runs.

---

## How it works

| Layer | What it does |
|---|---|
| **Local DNS resolver** (127.0.0.1:53) | Returns NXDOMAIN for YouTube domains — affects every browser that uses system DNS |
| **System DNS lock** (networksetup) | Points all network interfaces at 127.0.0.1; TamperWatcher restores every 60 s |
| **pf DNS lock** | Blocks outbound port 53/853 to any server that isn't 127.0.0.1; VPN can't override because loopback traffic is not routable |
| **pf YouTube IP block** | Blocks TCP to YouTube IP ranges for all UIDs except root |
| **Chrome CONNECT proxy** (127.0.0.1:8765, root) | Routes Chrome's YouTube connections through a root-owned proxy that pf's `user root` pass rule allows through |
| **Chrome enterprise policy** | Forces Chrome to use Cloudflare DoH, force-installs the extension on every profile, and sets the proxy PAC |
| **TamperWatcher** | 60 s heartbeat checks all six layers above plus binary code signatures; restores anything missing and emails Jenna |

---

## Before you build

### 1 — Credentials

Edit `Shared/Constants.swift` and fill in:

```swift
static let chromeExtensionID = "abcdefghijklmnopqrstuvwxyzabcdef"  // from Chrome Web Store
static let resendAPIKey   = "re_…"
static let resendFromAddr = "alerts@yourdomain.com"
static let dashboardURL   = "https://your-dashboard.vercel.app"
```

Jenna's email is entered during the first-run setup wizard; it is stored
in the system keychain (root-only) and never compiled into the binary.

### 2 — Code signing (required before deployment)

See [§ Signing](#signing) below. Build without signing first to verify
the project compiles, then add the certificate.

---

## Building

```bash
# Install XcodeGen if needed
brew install xcodegen

# Generate the Xcode project
xcodegen generate

# Open in Xcode and build the YouTubeMinus scheme
open YouTubeMinus.xcodeproj
```

Or from the command line:

```bash
xcodebuild -project YouTubeMinus.xcodeproj \
           -scheme YouTubeMinus \
           -configuration Release \
           build
```

---

## Signing

macOS will refuse to run a binary whose code signature does not match the
one that was applied at build time. This means replacing the daemon binary
on disk is immediately detectable — and the _running_ daemon checks its own
signature every 60 seconds.

### Option A — Self-signed certificate (personal use, no Apple account needed)

**Step 1: Create the certificate**

1. Open **Keychain Access** (Spotlight → "Keychain Access").
2. Menu → **Keychain Access → Certificate Assistant → Create a Certificate…**
3. Fill in the dialog:
   - **Name:** `YouTubeMinus Developer` ← must match `project.yml` exactly
   - **Identity Type:** Self Signed Root
   - **Certificate Type:** Code Signing
   - **Override defaults:** check the box
4. Click **Continue** until you reach the Trust page:
   - Set **When using this certificate** → **Always Trust**
5. Click **Done**. The certificate is stored in your login keychain.

**Step 2: Verify Xcode can see it**

```bash
security find-identity -v -p codesigning | grep "YouTubeMinus"
```

You should see a line like:
```
1) A1B2C3D4E5…  "YouTubeMinus Developer"
```

**Step 3: Build and sign**

Regenerate the project (so Xcode picks up the identity name):

```bash
xcodegen generate
```

Build the `YouTubeMinus` scheme in Xcode or via `xcodebuild`. Xcode will
use `YouTubeMinus Developer` automatically because `project.yml` sets
`CODE_SIGN_IDENTITY: "YouTubeMinus Developer"`.

**Step 4: Verify the signature**

After building, locate the products in `build/` and verify:

```bash
# Verify the app
codesign --verify --verbose \
  build/Debug/YouTubeMinus.app

# Verify the helper binary
codesign --verify --verbose \
  build/Debug/YouTubeMinusHelper

# Show full signature details
codesign --display --verbose=4 \
  build/Debug/YouTubeMinus.app
```

You should see `valid on disk` and `satisfies its Designated Requirement`.

**What self-signing protects against**

A modified binary no longer matches its original signature hash. If someone
replaces `/Library/PrivilegedHelperTools/YouTubeMinusHelper` with a tampered
version, the daemon (still running the original binary in memory) will detect
the invalid on-disk signature at the next 60-second TamperWatcher tick and
send Jenna an alert.

**What it does not protect against**

Gatekeeper shows an "unidentified developer" dialog the first time you open
the app and requires right-click → Open to allow it. Once allowed, macOS
remembers the decision. A self-signed certificate cannot be revoked remotely
the way an Apple Developer ID can.

### Option B — Apple Developer ID (notarized, $99/year)

1. Enrol in the [Apple Developer Program](https://developer.apple.com/programs/).
2. Create a **Developer ID Application** certificate in Xcode → Preferences → Accounts.
3. In `project.yml` change:
   ```yaml
   CODE_SIGN_IDENTITY: "Developer ID Application: Your Name (TEAMID)"
   DEVELOPMENT_TEAM: "YOURTEAMID"
   ```
4. After building, notarize via `notarytool`:
   ```bash
   xcrun notarytool submit build/Release/YouTubeMinus.app \
     --apple-id you@example.com \
     --team-id YOURTEAMID \
     --password "@keychain:AC_PASSWORD" \
     --wait
   xcrun stapler staple build/Release/YouTubeMinus.app
   ```
5. The daemon binary does not need to be notarized separately — it is
   installed by a root-privileged shell script, not Gatekeeper-checked.

---

## Chrome extension deployment

### Development (load unpacked)

During development, load the extension as **unpacked** via
`chrome://extensions` → Load unpacked. The extension ID will be a
32-character hash assigned by Chrome. Copy this ID into
`Constants.chromeExtensionID`.

The enterprise policy force-install and the pf/DNS layers work identically
with an unpacked extension. However, the extension source lives in a
local directory that Isaac could edit.

### Production (Chrome Web Store — required for tamper-proof deployment)

Publishing as an **unlisted** extension on the Chrome Web Store means:
- The extension is served from Chrome's internal encrypted cache
  (`~/Library/Application Support/Google/Chrome/Default/Extensions/…`)
  as a `.crx` packed and verified by Chrome — the source files are not
  editable.
- The extension cannot be removed, disabled, or replaced by Isaac once
  the `ExtensionInstallForcelist` policy is active.
- Chrome auto-updates the extension from the store, so any fix you publish
  rolls out immediately.

**How to publish as unlisted:**

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Create a new item, upload the extension ZIP.
3. On the **Privacy** tab select **Unlisted** (not Public, not Private).
4. Submit for review. Unlisted extensions still go through review but are
   not discoverable via search.
5. Once published, copy the permanent extension ID from the dashboard URL:
   ```
   https://chrome.google.com/webstore/detail/your-ext-name/EXTENSION_ID_HERE
   ```
6. Paste `EXTENSION_ID_HERE` into `Constants.chromeExtensionID` in
   `Shared/Constants.swift` and rebuild.

The `ChromePolicyManager` will then write:
```
ExtensionInstallForcelist:
  abcdefghijklmnopqrstuvwxyzabcdef;
  https://clients2.google.com/service/update2/crx
```

Chrome reads this at every launch and reinstalls the extension if it is
ever removed.

---

## First-run setup (Jenna runs this once)

1. Build and sign the app (above).
2. Copy `YouTubeMinus.app` to `/Applications`.
3. Launch it — the setup wizard appears.
4. **Jenna** enters her email, the Resend API key, and sets the protection
   password. Isaac should not be at the keyboard.
5. Click **Install** — macOS asks for the **admin** (computer login) password.
   This is separate from the protection password.
6. The daemon is copied to `/Library/PrivilegedHelperTools/` and loaded.
7. Done. The 🔒 icon appears in the menu bar.

**After setup, the daemon is fully independent of the app.** Deleting
`YouTubeMinus.app` does not stop enforcement. To uninstall the system
entirely, Jenna must enter her protection password through the app, which
then runs `Scripts/uninstall.sh` as root.

---

## Limitations and bypass surface

> This system creates strong friction and logs every meaningful bypass
> attempt. It is not cryptographically unbreakable. The goal is
> accountability, not impossibility.

| Bypass | Difficulty | Detection |
|---|---|---|
| Open YouTube in Safari / Firefox | Blocked outright (DNS + pf) | — |
| Use a VPN to override DNS | Blocked (pf DNS lock on port 53, loopback is non-routable) | TamperWatcher restores DNS within 60 s |
| Delete the Chrome enterprise policy file | Restored within 60 s | Email alert sent |
| Clear pf rules via `pfctl -F all` | Requires admin password; restored within 60 s | Email alert sent |
| Replace daemon binary on disk | Binary signature mismatch detected within 60 s | Email alert sent |
| Kill the daemon process | launchd restarts it immediately (KeepAlive = true) | — |
| **Disable app via `sudo launchctl bootout`** | Requires admin password | Email alert sent on next DNS/pf restore failure |
| **Boot into Recovery Mode and delete everything** | Requires physical access + restart; visible in logs | — |

Isaac as a **standard user** (non-admin) cannot use `sudo`. The boundary
between "hard enough" and "easy enough to be accountable for" sits exactly
there. Ensure Isaac does not have admin rights on the Mac.
