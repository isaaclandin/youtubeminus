import Foundation

/// Manages system-wide DNS configuration so that all network interfaces
/// resolve through our local blocking resolver at 127.0.0.1.
///
/// Falls back to 8.8.8.8 so internet keeps working if our daemon restarts.
final class SystemDNSManager {

    private let primary   = Constants.localDNSHost
    private let fallback1 = Constants.upstreamDNS1
    private let fallback2 = Constants.upstreamDNS2

    // MARK: - Configure (called once at startup)

    func configureDNS() {
        for service in networkServices() {
            setDNS(on: service, servers: [primary, fallback1, fallback2])
        }
        NSLog("[SystemDNS] DNS configured to 127.0.0.1 on \(networkServices().count) interface(s).")
    }

    // MARK: - Check and restore (called by TamperWatcher)

    /// Returns true if DNS was already correct on every interface.
    @discardableResult
    func checkAndRestore() -> Bool {
        var allOk = true
        for service in networkServices() {
            let current = currentDNS(on: service)
            if current.first != primary {
                NSLog("[SystemDNS] Tamper detected on '\(service)' — restoring.")
                setDNS(on: service, servers: [primary, fallback1, fallback2])
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
