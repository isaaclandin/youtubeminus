import Foundation

// ── Entry point ───────────────────────────────────────────────────────────────
// Runs as root via launchd at /Library/PrivilegedHelperTools/YouTubeMinusHelper.
// This binary has NO dependency on the app bundle; it can continue enforcing
// even if YouTubeMinus.app is deleted.
//
// Startup order:
//   1. Start the local DNS blocking resolver (127.0.0.1:53)
//   2. Configure system DNS → 127.0.0.1 on every network interface
//   3. Write/verify Chrome enterprise policy (DoH + extension force-install + PAC proxy)
//   4. Write/verify pf firewall rules (DNS lock + YouTube IP block for non-root)
//   5. Start the CONNECT proxy (Chrome routes YouTube through this as root)
//   6. Start the XPC listener (accepts calls from the main app UI)
//   7. Start the tamper watcher (60-second heartbeat over all subsystems)

let dns    = DNSServer()
let sysDNS = SystemDNSManager()
let chrome = ChromePolicyManager()
let pf     = PFFirewallManager()
let proxy  = ChromeProxy()
let xpc    = XPCListener()
let watcher = TamperWatcher(dns: dns, sysDNS: sysDNS, chrome: chrome, pf: pf)

// Wire XPC listener to subsystems it needs for status/control
xpc.dnsServer = dns
xpc.sysDNS    = sysDNS
xpc.chrome    = chrome
xpc.watcher   = watcher

do {
    try dns.start()
    sysDNS.configureDNS()
    chrome.installPolicy()
    pf.install()
    try proxy.start()
    xpc.start()
    watcher.start()
    NSLog("[YouTubeMinusHelper] All systems active. " +
          "Binary: \(CommandLine.arguments[0])")
} catch {
    NSLog("[YouTubeMinusHelper] Fatal startup error: \(error). Exiting.")
    exit(1)
}

RunLoop.main.run()
