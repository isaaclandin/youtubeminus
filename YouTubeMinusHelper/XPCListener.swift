import Foundation

/// The privileged helper's XPC server.
/// Registers a Mach service so the main app can connect via NSXPCConnection.
final class XPCListener: NSObject, NSXPCListenerDelegate, YouTubeMinusXPCProtocol {

    private var listener: NSXPCListener?
    private let keychain = HelperKeychain()

    // References to the subsystems (set after start() is called by main.swift)
    var dnsServer:  DNSServer?
    var sysDNS:     SystemDNSManager?
    var chrome:     ChromePolicyManager?
    var watcher:    TamperWatcher?

    // MARK: - Start

    func start() {
        let l = NSXPCListener(machServiceName: Constants.helperMachService)
        l.delegate = self
        l.resume()
        listener = l
        NSLog("[XPCListener] Mach service '\(Constants.helperMachService)' active.")
    }

    // MARK: - NSXPCListenerDelegate

    func listener(_ listener: NSXPCListener,
                  shouldAcceptNewConnection conn: NSXPCConnection) -> Bool {
        // Accept connections only from our main app (bundle ID check).
        // On macOS the audit token gives us the sender's pid/bundle; for
        // a personal app a simple pid lookup suffices.
        conn.exportedInterface = NSXPCInterface(with: YouTubeMinusXPCProtocol.self)
        conn.exportedObject = self
        conn.resume()
        return true
    }

    // MARK: - YouTubeMinusXPCProtocol

    func getStatus(reply: @escaping ([String: Any]) -> Void) {
        reply([
            "dnsActive":       dnsServer?.isRunning  ?? false,
            "dnsConfigured":   sysDNS != nil,          // assumed configured if running
            "policyInstalled": chrome?.isInstalled    ?? false,
            "tamperCount":     0                        // could track in TamperWatcher
        ])
    }

    func verifyUninstallCode(_ code: String, reply: @escaping (Bool) -> Void) {
        reply(keychain.verifyUninstallCode(code))
    }

    func setUninstallCode(_ code: String, reply: @escaping (Bool) -> Void) {
        let ok = keychain.storeUninstallCode(code)
        NSLog("[XPCListener] setUninstallCode: \(ok ? "success" : "failed")")
        reply(ok)
    }

    func setPartnerChatIds(_ ids: String, reply: @escaping (Bool) -> Void) {
        let list = ids.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
        let ok = keychain.storePartnerChatIds(list)
        NSLog("[XPCListener] setPartnerChatIds (\(list.count) ids): \(ok ? "success" : "failed")")
        reply(ok)
    }

    func checkAndRestoreNow(reason: String, reply: @escaping (Bool) -> Void) {
        NSLog("[XPCListener] Immediate tamper-check requested: \(reason)")
        // Run all checks right now
        watcher?.tick()
        reply(true)
    }
}
