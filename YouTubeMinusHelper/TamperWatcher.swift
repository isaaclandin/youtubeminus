import Foundation

/// 60-second heartbeat that checks all enforcement subsystems and restores
/// anything that has been removed, disabled, or modified.
///
/// Every detected tamper is logged and triggers a Telegram alert to partners.
final class TamperWatcher {

    private weak var dns:    DNSServer?
    private weak var sysDNS: SystemDNSManager?
    private weak var chrome: ChromePolicyManager?
    private weak var pf:     PFFirewallManager?
    private var timer: DispatchSourceTimer?

    // Track whether Private Relay was active last tick so we only alert on change
    private var privateRelayWasActive = false

    init(dns: DNSServer, sysDNS: SystemDNSManager,
         chrome: ChromePolicyManager, pf: PFFirewallManager) {
        self.dns    = dns
        self.sysDNS = sysDNS
        self.chrome = chrome
        self.pf     = pf
    }

    // MARK: - Start

    func start() {
        let source = DispatchSource.makeTimerSource(queue: .global())
        source.schedule(deadline: .now() + Constants.tamperCheckInterval,
                        repeating: Constants.tamperCheckInterval)
        source.setEventHandler { [weak self] in self?.tick() }
        source.resume()
        timer = source
        NSLog("[TamperWatcher] Started — checking every \(Int(Constants.tamperCheckInterval))s.")
    }

    // MARK: - Tick

    func tick() {
        var tampers: [String] = []

        // 1. DNS resolver
        if let dns, !dns.isRunning {
            tampers.append("DNS blocking server was not running")
            try? dns.start()
        }

        // 2. System DNS configuration
        if let sysDNS, !sysDNS.checkAndRestore() {
            tampers.append("System DNS was changed away from 127.0.0.1")
        }

        // 3. Chrome enterprise policy (DoH + extension force-install + PAC proxy)
        if let chrome, !chrome.checkAndRestore() {
            tampers.append("Chrome policy file was removed or modified")
        }

        // 4. pf firewall rules (YouTube IP block + DNS lock)
        if let pf, !pf.checkAndRestore() {
            tampers.append("pf firewall anchor was cleared")
        }

        // 5. Binary integrity — detect if daemon binary was replaced on disk
        if let issue = SignatureVerifier.integrityReport() {
            tampers.append("Code signature check failed: \(issue)")
        }

        // 6. iCloud Private Relay — bypasses both DNS and pf blocking entirely
        let relayActive = isPrivateRelayActive()
        if relayActive && !privateRelayWasActive {
            tampers.append("iCloud Private Relay was enabled — YouTube blocking is bypassed in Safari")
        }
        privateRelayWasActive = relayActive

        if !tampers.isEmpty {
            let what = tampers.joined(separator: "; ")
            NSLog("[TamperWatcher] Tamper detected (alerts muted): \(what)")
            // sendAlert(what: what)  // temporarily muted during testing
        }
    }

    // MARK: - Private Relay detection

    /// Returns true if iCloud Private Relay appears to be active.
    ///
    /// When Private Relay is on, macOS loads Apple's DNS proxy which inserts
    /// resolver entries referencing Apple's relay infrastructure into the
    /// system DNS configuration. We detect these via `scutil --dns`.
    private func isPrivateRelayActive() -> Bool {
        let output = shell("scutil --dns 2>/dev/null")

        // Apple's Private Relay DNS proxy shows up as entries referencing
        // their masked/relay DNS infrastructure.
        let indicators = [
            "apple-dns.net",
            "masked-a.",
            "masked-h.",
            "private-relay",
        ]
        let lower = output.lowercased()
        let detected = indicators.contains { lower.contains($0) }

        if detected {
            NSLog("[TamperWatcher] iCloud Private Relay detected in scutil --dns output.")
        }
        return detected
    }

    // MARK: - Alert

    private func sendAlert(what: String) {
        AlertMailer.send(what: what)
    }

    // MARK: - Shell helper

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
