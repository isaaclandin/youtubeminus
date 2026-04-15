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

    func install(jennaEmail: String, password: String, resendKey: String,
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

        // Wait up to 5 s for helper to appear, then send initial config via XPC.
        waitForHelper(timeout: 5) { [weak self] available in
            guard available else {
                completion(.failure(InstallerError.helperDidNotStart))
                return
            }
            self?.configureHelper(jennaEmail: jennaEmail, password: password,
                                  resendKey: resendKey, completion: completion)
        }
    }

    // MARK: - Private

    private func configureHelper(jennaEmail: String, password: String, resendKey: String,
                                  completion: @escaping (Result<Void, Error>) -> Void) {
        HelperManager.shared.setPassword(password, jennaEmail: jennaEmail,
                                         resendKey: resendKey) { ok in
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
            case .xpcSetupFailed: return "Could not configure helper over XPC."
            }
        }
    }
}
