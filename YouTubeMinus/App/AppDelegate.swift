import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {

    private var menuBarController: MenuBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Prevent showing in Dock
        NSApp.setActivationPolicy(.accessory)

        // Block quit via Cmd+Q — the menu bar item has no "Quit" entry
        // and we intercept applicationShouldTerminate below.

        menuBarController = MenuBarController()

        // If the helper has never been set up, show the setup window immediately.
        if !HelperInstaller.shared.isInstalled {
            showSetupWindow()
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        // Intercept quit. Ask for Jenna's password before allowing it.
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
            // Called when setup completes; nothing extra needed here —
            // the MenuBarController reacts to the helper becoming available.
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
}
