import Foundation

/// Manages macOS pf firewall rules for two purposes:
///
/// 1. **DNS lock** — blocks all outbound DNS (UDP/TCP port 53) to any server
///    other than 127.0.0.1, preventing any browser from bypassing our local
///    resolver (even when a VPN is active, because VPN can't reroute loopback).
///
/// 2. **YouTube IP block** — blocks direct connections to YouTube's IP ranges
///    from all processes except root (UID 0).  Our CONNECT proxy (ChromeProxy)
///    runs as root, so it passes the `user root` match and can relay Chrome's
///    HTTPS connections through to YouTube.  User-space browsers (Firefox, Safari,
///    Arc, …) are denied.
///
/// Rules are installed into a named pf anchor ("com.youtubeminus") and the anchor
/// reference is appended to /etc/pf.conf so it survives pf restarts.  TamperWatcher
/// calls checkAndRestore() every 60 seconds.
final class PFFirewallManager {

    // MARK: - Public

    /// Write rules to disk and load them.
    func install() {
        createSupportDir()
        writeRulesFile()
        patchPFConf()
        load()
        NSLog("[PFFirewall] Rules installed and loaded.")
    }

    /// Returns true if the anchor is currently loaded and contains our rules.
    var isInstalled: Bool {
        let out = shell("pfctl -a '\(Constants.pfAnchorName)' -sr 2>/dev/null")
        return out.contains("youtube")
    }

    /// Re-loads rules if the anchor has been cleared or pf.conf patched away.
    @discardableResult
    func checkAndRestore() -> Bool {
        var ok = true
        if !isInstalled {
            NSLog("[PFFirewall] Anchor missing — restoring.")
            writeRulesFile()
            load()
            ok = false
        }
        if !pfConfPatched() {
            NSLog("[PFFirewall] pf.conf entry missing — restoring.")
            patchPFConf()
            ok = false
        }
        return ok
    }

    // MARK: - Private: rules file

    private func createSupportDir() {
        try? FileManager.default.createDirectory(atPath: Constants.supportDir,
                                                  withIntermediateDirectories: true)
    }

    private func writeRulesFile() {
        let ipList = Constants.youtubeIPRanges.joined(separator: ", ")
        let rules = """
        # YouTubeMinus pf anchor — managed automatically, do not edit.

        # YouTube IP table
        table <youtube> persist { \(ipList) }

        # ── Rule 1: Allow root (the ChromeProxy daemon) to reach YouTube IPs ──
        # pf matches the UID of the socket owner for outbound traffic.
        # ChromeProxy runs as root (UID 0) so it can relay Chrome's connections.
        pass out quick proto tcp from any to <youtube> user root
        pass out quick proto udp from any to <youtube> port 443 user root

        # ── Rule 2: Block all other processes from reaching YouTube IPs ────────
        # User-space browsers (Firefox, Safari, Arc, …) cannot connect directly.
        # Both TCP (HTTPS) and UDP port 443 (QUIC/HTTP3) are blocked.
        block out proto tcp from any to <youtube>
        block out proto udp from any to <youtube> port 443

        # ── Rule 3: DNS lock ──────────────────────────────────────────────────
        # Prevent any process from using a DNS server other than our local resolver.
        # VPN-pushed DNS servers are blocked here even if networksetup is tampered.
        block out quick proto udp from any to !127.0.0.1 port 53
        block out quick proto tcp from any to !127.0.0.1 port 53

        # ── Rule 4: Block DNS-over-TLS to external servers ─────────────────────
        block out quick proto tcp from any to !127.0.0.1 port 853
        """

        try? rules.write(toFile: Constants.pfRulesPath, atomically: true, encoding: .utf8)
    }

    // MARK: - Private: pf.conf anchor reference

    private let anchorMarker = "# YouTubeMinus anchor"

    private func pfConfPatched() -> Bool {
        let conf = (try? String(contentsOfFile: "/etc/pf.conf")) ?? ""
        return conf.contains(anchorMarker)
    }

    private func patchPFConf() {
        let pfConf = "/etc/pf.conf"
        guard var conf = try? String(contentsOfFile: pfConf) else { return }
        guard !conf.contains(anchorMarker) else { return }

        conf += """

        \(anchorMarker)
        anchor "\(Constants.pfAnchorName)"
        load anchor "\(Constants.pfAnchorName)" from "\(Constants.pfRulesPath)"
        """
        try? conf.write(toFile: pfConf, atomically: true, encoding: .utf8)
    }

    // MARK: - Private: load / reload

    private func load() {
        // Enable pf in case it's off.
        shell("pfctl -e 2>/dev/null || true")
        // Load our anchor.
        shell("pfctl -a '\(Constants.pfAnchorName)' -f '\(Constants.pfRulesPath)'")
        // Reload the full pf config so the anchor reference takes effect.
        shell("pfctl -f /etc/pf.conf 2>/dev/null || true")
    }

    @discardableResult
    private func shell(_ cmd: String) -> String {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/sh")
        task.arguments = ["-c", cmd]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError  = pipe
        try? task.run()
        task.waitUntilExit()
        return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    }
}
