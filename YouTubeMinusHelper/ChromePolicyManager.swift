import Foundation

/// Writes and verifies the Chrome enterprise policy file.
///
/// Three policies installed:
///
/// 1. **DoH** — forces Chrome to resolve DNS via Cloudflare DNS-over-HTTPS,
///    bypassing our local NXDOMAIN resolver so Chrome can reach YouTube.
///
/// 2. **ExtensionInstallForcelist** — force-installs the accountability
///    extension on every Chrome profile. Chrome cannot disable or remove it.
///
/// 3. **ProxySettings / PAC script** — routes Chrome's YouTube connections
///    through our local CONNECT proxy (127.0.0.1:8765), which runs as root.
///    pf blocks YouTube IPs for all non-root UIDs; the proxy (root) is exempt,
///    so Chrome reaches YouTube while Firefox/Safari/Arc cannot.
///
/// The policy file lives at /Library/Managed Preferences/com.google.Chrome.plist
/// and the PAC file at /Library/Application Support/YouTubeMinus/proxy.pac.
/// Both require root to write — which we have as a launch daemon.
final class ChromePolicyManager {

    private let policyPath = Constants.chromePolicyPath
    private let pacPath    = Constants.proxyPACPath

    // MARK: - Install

    func installPolicy() {
        writePAC()

        let extensionEntry = "\(Constants.chromeExtensionID);" +
            "https://clients2.google.com/service/update2/crx"

        let policy: [String: Any] = [
            // 1. DoH — Chrome uses Cloudflare, not system DNS
            "DnsOverHttpsMode":        Constants.chromeDoHMode,
            "DnsOverHttpsTemplates":   Constants.chromeDoHTemplate,
            "BuiltInDnsClientEnabled": true,

            // 2. Force-install the accountability extension on all profiles
            "ExtensionInstallForcelist": [extensionEntry],

            // 3. PAC proxy — YouTube traffic routed through our root-owned proxy
            "ProxySettings": [
                "ProxyMode":   "pac_script",
                "ProxyPacUrl": "file://\(pacPath)"
            ]
        ]

        do {
            let dir = (policyPath as NSString).deletingLastPathComponent
            try FileManager.default.createDirectory(atPath: dir,
                                                     withIntermediateDirectories: true)
            let data = try PropertyListSerialization.data(fromPropertyList: policy,
                                                          format: .xml,
                                                          options: 0)
            try data.write(to: URL(fileURLWithPath: policyPath), options: .atomic)
            NSLog("[ChromePolicy] Policy written to \(policyPath)")
        } catch {
            NSLog("[ChromePolicy] Failed to write policy: \(error)")
        }
    }

    // MARK: - PAC file

    private func writePAC() {
        try? FileManager.default.createDirectory(atPath: Constants.supportDir,
                                                  withIntermediateDirectories: true)
        let port = Constants.chromeProxyPort
        // Build the JavaScript host-match list from our blocked-domains constant
        let domainList = Constants.blockedDomains
            .map { "\"\($0)\"" }
            .joined(separator: ", ")

        let pac = """
        // YouTubeMinus PAC — routes YouTube traffic through the local root proxy.
        // Managed automatically. Do not edit.
        function FindProxyForURL(url, host) {
            var blocked = [\(domainList)];
            var h = host.toLowerCase();
            for (var i = 0; i < blocked.length; i++) {
                if (h === blocked[i] || h.substr(h.length - blocked[i].length - 1) === "." + blocked[i]) {
                    return "PROXY 127.0.0.1:\(port)";
                }
            }
            return "DIRECT";
        }
        """
        try? pac.write(toFile: pacPath, atomically: true, encoding: .utf8)
    }

    // MARK: - Verify

    var isInstalled: Bool {
        guard FileManager.default.fileExists(atPath: policyPath),
              let dict = NSDictionary(contentsOfFile: policyPath) else { return false }
        // Require all three policy groups to be present
        let hasDoH       = dict["DnsOverHttpsMode"] as? String == Constants.chromeDoHMode
        let hasExtension = (dict["ExtensionInstallForcelist"] as? [String])?.isEmpty == false
        let hasProxy     = dict["ProxySettings"] != nil
        let hasPAC       = FileManager.default.fileExists(atPath: pacPath)
        return hasDoH && hasExtension && hasProxy && hasPAC
    }

    // MARK: - Restore if missing or incomplete

    @discardableResult
    func checkAndRestore() -> Bool {
        if !isInstalled {
            NSLog("[ChromePolicy] Policy missing or incomplete — restoring.")
            installPolicy()
            return false
        }
        return true
    }
}
