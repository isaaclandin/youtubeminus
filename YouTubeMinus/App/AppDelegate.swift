import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {

    private var menuBarController: MenuBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Prevent showing in Dock
        NSApp.setActivationPolicy(.accessory)

        menuBarController = MenuBarController()

        if !HelperInstaller.shared.isInstalled {
            showSetupWindow()
        } else {
            // Daemon is running — refresh partner chat IDs in the background.
            // This ensures tamper alerts go to the current partner even if it
            // changed since the last install.
            refreshPartnerChatIds()
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        menuBarController?.requestUninstallCodeForAction(action: "quit the app") { granted in
            if granted {
                NSApplication.shared.reply(toApplicationShouldTerminate: true)
            }
        }
        return .terminateLater
    }

    // MARK: - Setup window

    func showSetupWindow() {
        let setupView = SetupView {
            // Called when setup completes — refresh chat IDs immediately since
            // the session was just saved during install.
            self.refreshPartnerChatIds()
        }
        let hostingController = NSHostingController(rootView: setupView)
        let window = NSWindow(contentViewController: hostingController)
        window.title = "YouTubeMinus Setup"
        window.styleMask = [.titled, .closable]
        window.setContentSize(NSSize(width: 480, height: 520))
        window.center()
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - Partner chat ID refresh

    /// Loads the stored session, refreshes the access token, fetches current
    /// partner chat IDs from Supabase, and pushes them to the helper keychain.
    /// Silent on failure — the stale IDs remain in place until the next launch.
    private func refreshPartnerChatIds() {
        Task {
            guard let stored = SupabaseClient.loadStoredSession() else {
                NSLog("[AppDelegate] No stored session — skipping partner chat ID refresh.")
                return
            }

            do {
                let auth = try await SupabaseClient.refreshSession(
                    userId: stored.userId,
                    refreshToken: stored.refreshToken
                )

                let chatIds = try await SupabaseClient.fetchPartnerChatIds(
                    userId: auth.userId,
                    accessToken: auth.accessToken
                )

                guard !chatIds.isEmpty else {
                    NSLog("[AppDelegate] No active partners found — chat IDs not updated.")
                    return
                }

                HelperManager.shared.setPartnerChatIds(chatIds) { ok in
                    NSLog("[AppDelegate] Partner chat IDs refreshed (\(chatIds.count) partner(s)): \(ok ? "ok" : "failed")")
                }
            } catch {
                NSLog("[AppDelegate] Partner chat ID refresh failed: \(error.localizedDescription)")
            }
        }
    }
}
