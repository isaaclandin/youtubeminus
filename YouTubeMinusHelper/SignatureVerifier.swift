import Foundation
import Security

/// Verifies code signatures of the daemon itself and the main app binary.
///
/// Why this matters: even with a password-gated uninstall flow, a determined
/// attacker could replace the daemon binary on disk between launchd restarts.
/// The running daemon checks its own signature every 60 seconds; a replacement
/// binary will have a different (or missing) signature and trigger an alert.
///
/// Self-checking is not foolproof — a modified binary that also skips this
/// check won't catch itself — but it covers the window between the old daemon
/// detecting the tamper and the new binary being loaded by launchd.
enum SignatureVerifier {

    // MARK: - Own binary (daemon)

    /// Returns true if the currently-running binary's signature is intact.
    static func ownSignatureIsValid() -> Bool {
        var code: SecCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess,
              let code else { return false }
        // Empty SecCSFlags = default behavior (no extra checks)
        let flags: SecCSFlags = []
        return SecCodeCheckValidity(code, flags, nil) == errSecSuccess
    }

    // MARK: - File on disk

    /// Returns true if the binary at `path` has a valid code signature.
    /// Used by TamperWatcher to check the daemon binary at its install path.
    static func signatureIsValid(at path: String) -> Bool {
        let url = URL(fileURLWithPath: path) as CFURL
        var staticCode: SecStaticCode?
        guard SecStaticCodeCreateWithPath(url, [], &staticCode) == errSecSuccess,
              let staticCode else { return false }
        let flags: SecCSFlags = []
        return SecStaticCodeCheckValidity(staticCode, flags, nil) == errSecSuccess
    }

    // MARK: - Convenience

    /// Check both the running image and the on-disk binary match.
    /// Returns a description of what failed, or nil if everything is intact.
    static func integrityReport() -> String? {
        var issues: [String] = []

        if !ownSignatureIsValid() {
            issues.append("running daemon binary has an invalid code signature")
        }

        let installPath = Constants.helperInstallPath
        if !signatureIsValid(at: installPath) {
            issues.append("on-disk helper binary at \(installPath) has an invalid code signature")
        }

        return issues.isEmpty ? nil : issues.joined(separator: "; ")
    }
}
