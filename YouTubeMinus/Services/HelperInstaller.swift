import Foundation
import AppKit

/// Handles one-time privileged installation of the daemon.
///
/// Strategy: embed the helper binary and launchd plist inside the app bundle,
/// then use an AppleScript "do shell script … with administrator privileges"
/// to copy them into place and load the daemon.  This requires only a single
/// admin-password prompt — no special entitlements, no SMJobBless, no App Store.
final class HelperInstaller {

    static let shared = HelperInstaller()
    private init() {}

    var isInstalled: Bool {
        FileManager.default.fileExists(atPath: "/Library/LaunchDaemons/com.youtubeminus.helper.plist")
    }

    // MARK: - Install

    /// Installs the daemon and stores a randomly-generated uninstall code in:
    ///   1. The system keychain (root-only, for local verification)
    ///   2. The user's Supabase profile (plaintext, visible to partners on the dashboard)
    ///
    /// The caller never receives the plaintext code — it goes straight to the partner dashboard.
    func install(accessToken: String, userId: String,
                 completion: @escaping (Result<Void, Error>) -> Void) {

        guard let helperSrc = helperBinaryPath,
              let plistSrc  = launchDaemonPlistPath else {
            completion(.failure(InstallerError.bundleResourceMissing))
            return
        }

        // Build install shell script that runs as root via AppleScript.
        // 1. Copy helper binary to PrivilegedHelperTools
        // 2. Copy launchd plist to LaunchDaemons
        // 3. Set ownership/permissions
        // 4. Load the daemon
        let script = """
        do shell script "\\
        mkdir -p /Library/PrivilegedHelperTools && \\
        cp -f '\(helperSrc)' /Library/PrivilegedHelperTools/YouTubeMinusHelper && \\
        chmod 755 /Library/PrivilegedHelperTools/YouTubeMinusHelper && \\
        chown root:wheel /Library/PrivilegedHelperTools/YouTubeMinusHelper && \\
        cp -f '\(plistSrc)' /Library/LaunchDaemons/com.youtubeminus.helper.plist && \\
        chmod 644 /Library/LaunchDaemons/com.youtubeminus.helper.plist && \\
        chown root:wheel /Library/LaunchDaemons/com.youtubeminus.helper.plist && \\
        launchctl bootstrap system /Library/LaunchDaemons/com.youtubeminus.helper.plist \\
        " with administrator privileges
        """

        var error: NSDictionary?
        NSAppleScript(source: script)?.executeAndReturnError(&error)

        if let err = error {
            let msg = err[NSAppleScript.errorMessage] as? String ?? "Unknown AppleScript error"
            completion(.failure(InstallerError.applescriptFailed(msg)))
            return
        }

        let code = Self.generateUninstallCode()

        // Wait up to 5 s for helper to appear, then store the code via XPC.
        waitForHelper(timeout: 5) { [weak self] available in
            guard available else {
                completion(.failure(InstallerError.helperDidNotStart))
                return
            }
            self?.storeCodeLocally(code) { result in
                switch result {
                case .failure(let err):
                    completion(.failure(err))
                case .success:
                    Task {
                        do {
                            // Push plaintext code to partner dashboard
                            try await SupabaseClient.storeUninstallCode(code, userId: userId,
                                                                         accessToken: accessToken)

                            // Cache partner chat IDs in system keychain for tamper alerts
                            let chatIds = try await SupabaseClient.fetchPartnerChatIds(
                                userId: userId, accessToken: accessToken)
                            if !chatIds.isEmpty {
                                HelperManager.shared.setPartnerChatIds(chatIds) { ok in
                                    NSLog("[HelperInstaller] cached \(chatIds.count) partner chat ID(s): \(ok)")
                                }
                            }

                            completion(.success(()))
                        } catch {
                            completion(.failure(error))
                        }
                    }
                }
            }
        }
    }

    // MARK: - Private

    private func storeCodeLocally(_ code: String,
                                   completion: @escaping (Result<Void, Error>) -> Void) {
        HelperManager.shared.setUninstallCode(code) { ok in
            if ok {
                completion(.success(()))
            } else {
                completion(.failure(InstallerError.xpcSetupFailed))
            }
        }
    }

    private func waitForHelper(timeout: TimeInterval, completion: @escaping (Bool) -> Void) {
        let deadline = Date().addingTimeInterval(timeout)
        func attempt() {
            HelperManager.shared.getStatus { status in
                if !(status.isEmpty) {
                    completion(true)
                    return
                }
                if Date() >= deadline {
                    completion(false)
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { attempt() }
            }
        }
        attempt()
    }

    private var helperBinaryPath: String? {
        Bundle.main.path(forResource: "YouTubeMinusHelper", ofType: nil,
                          inDirectory: "Contents/MacOS")
        ?? Bundle.main.bundlePath + "/Contents/MacOS/YouTubeMinusHelper"
    }

    private var launchDaemonPlistPath: String? {
        Bundle.main.path(forResource: "com.youtubeminus.helper", ofType: "plist",
                          inDirectory: "Contents/LaunchDaemons")
        ?? Bundle.main.bundlePath + "/Contents/LaunchDaemons/com.youtubeminus.helper.plist"
    }

    /// Generates a random 8-character code formatted as XXXX-XXXX.
    /// Uses uppercase letters and digits, excluding visually ambiguous chars (0, O, I, 1).
    static func generateUninstallCode() -> String {
        let charset = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        var result = ""
        for i in 0..<8 {
            if i == 4 { result += "-" }
            result += String(charset[Int.random(in: 0..<charset.count)])
        }
        return result
    }

    // MARK: - Errors

    enum InstallerError: LocalizedError {
        case bundleResourceMissing
        case applescriptFailed(String)
        case helperDidNotStart
        case xpcSetupFailed

        var errorDescription: String? {
            switch self {
            case .bundleResourceMissing: return "Helper binary or plist not found in app bundle."
            case .applescriptFailed(let m): return m
            case .helperDidNotStart: return "Daemon started but did not respond in time."
            case .xpcSetupFailed: return "Could not store uninstall code in helper."
            }
        }
    }
}
