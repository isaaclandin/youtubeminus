import Foundation

/// 60-second heartbeat that checks all enforcement subsystems and restores
/// anything that has been removed, disabled, or modified.
///
/// Every detected tamper is logged and triggers a Resend email to Jenna.
final class TamperWatcher {

    private weak var dns:    DNSServer?
    private weak var sysDNS: SystemDNSManager?
    private weak var chrome: ChromePolicyManager?
    private weak var pf:     PFFirewallManager?
    private var timer: DispatchSourceTimer?

    init(dns: DNSServer, sysDNS: SystemDNSManager,
         chrome: ChromePolicyManager, pf: PFFirewallManager) {
        self.dns    = dns
        self.sysDNS = sysDNS
        self.chrome = chrome
        self.pf     = pf
    }

    // MARK: - Public one-shot (called by XPC on demand)

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

        if !tampers.isEmpty {
            let what = tampers.joined(separator: "; ")
            NSLog("[TamperWatcher] Tamper detected: \(what)")
            sendAlert(what: what)
        }
    }

    // MARK: - Alert

    private func sendAlert(what: String) {
        AlertMailer.send(what: what)
    }
}
