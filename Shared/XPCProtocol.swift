import Foundation

/// Both the main app and the privileged helper import this file.
/// The helper exposes this interface; the app calls it.
@objc(YouTubeMinusXPCProtocol)
protocol YouTubeMinusXPCProtocol {

    /// Returns a status dictionary with keys:
    ///   "dnsActive"       Bool   — DNS server is bound and serving
    ///   "dnsConfigured"   Bool   — system DNS points to 127.0.0.1
    ///   "policyInstalled" Bool   — Chrome DoH policy file exists
    ///   "tamperCount"     Int    — times a tamper was detected this session
    func getStatus(reply: @escaping ([String: Any]) -> Void)

    /// Verify the uninstall code.
    /// The helper compares the hash stored in /Library/… against the
    /// SHA-256+salt hash of the supplied code.
    func verifyUninstallCode(_ code: String, reply: @escaping (Bool) -> Void)

    /// Called once during first-run setup to persist the uninstall code hash.
    func setUninstallCode(_ code: String, reply: @escaping (Bool) -> Void)

    /// Store partner Telegram chat IDs (newline-separated) for tamper alerts.
    /// Called during setup and whenever the partner list changes.
    func setPartnerChatIds(_ ids: String, reply: @escaping (Bool) -> Void)

    /// Force an immediate tamper-check cycle (used by the app after detecting
    /// something suspicious on the user side).
    func checkAndRestoreNow(reason: String, reply: @escaping (Bool) -> Void)
}
