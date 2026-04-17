import Foundation

/// Manages system-wide DNS configuration so that all network interfaces
/// resolve through our local blocking resolver at 127.0.0.1.
///
/// 127.0.0.1 is set as the ONLY DNS server. Our local resolver forwards
/// all non-YouTube queries to 8.8.8.8/1.1.1.1 internally, so internet
/// keeps working. Having upstream servers in the system DNS list allows
/// browsers to bypass our resolver — so we set only 127.0.0.1.
final class SystemDNSManager {

    private let primary = Constants.localDNSHost

    // MARK: - Configure (called once at startup)

    func configureDNS() {
        for service in networkServices() {
            setDNS(on: service, servers: [primary])
        }
        NSLog("[SystemDNS] DNS configured to 127.0.0.1 (only) on \(networkServices().count) interface(s).")
    }

    // MARK: - Check and restore (called by TamperWatcher)

    /// Returns true if DNS was already correct on every interface.
    @discardableResult
    func checkAndRestore() -> Bool {
        var allOk = true
        for service in networkServices() {
            let current = currentDNS(on: service)
            // Tampered if first server isn't ours, or if fallbacks have been added back
            if current != [primary] {
                NSLog("[SystemDNS] Tamper detected on '\(service)' — restoring.")
                setDNS(on: service, servers: [primary])
                allOk = false
            }
        }
        return allOk
    }

    // MARK: - Private helpers

    private func networkServices() -> [String] {
        let out = shell("networksetup -listallnetworkservices")
        // First line is a header ("An asterisk (*) denotes that…"); skip it.
        return out.components(separatedBy: "\n")
            .dropFirst()
            .map { $0.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "*")) }
            .filter { !$0.isEmpty }
    }

    private func currentDNS(on service: String) -> [String] {
        let out = shell("networksetup -getdnsservers '\(service)'")
        // Output is either a list of IPs or "There aren't any DNS Servers set on…"
        return out.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.contains(".") }  // rough IP filter
    }

    private func setDNS(on service: String, servers: [String]) {
        let serverList = servers.joined(separator: " ")
        shell("networksetup -setdnsservers '\(service)' \(serverList)")
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
