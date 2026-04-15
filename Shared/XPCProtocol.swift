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

    /// Verify Jenna's protection password.
    /// The helper compares the hash stored in /Library/… against the
    /// SHA-256+salt hash of the supplied password.
    func verifyPassword(_ password: String, reply: @escaping (Bool) -> Void)

    /// Called once during first-run setup to persist the password hash.
    func setPassword(_ password: String, jennaEmail: String,
                     resendKey: String, reply: @escaping (Bool) -> Void)

    /// Force an immediate tamper-check cycle (used by the app after detecting
    /// something suspicious on the user side).
    func checkAndRestoreNow(reason: String, reply: @escaping (Bool) -> Void)
}
