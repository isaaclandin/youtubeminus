import AppKit
import SwiftUI

final class MenuBarController {

    private var statusItem: NSStatusItem!
    private var popover: NSPopover!
    private var popoverView: StatusPopoverView!

    init() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "lock.fill", accessibilityDescription: "YouTubeMinus enforcing")
            button.imageScaling = .scaleProportionallyDown
            button.action = #selector(togglePopover)
            button.target = self
        }

        popoverView = StatusPopoverView(menuBarController: self)
        popover = NSPopover()
        popover.contentViewController = NSHostingController(rootView: popoverView)
        popover.behavior = .transient
        popover.animates = true
    }

    @objc private func togglePopover() {
        if popover.isShown {
            popover.performClose(nil)
        } else {
            guard let button = statusItem.button else { return }
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }

    func closePopover() {
        popover.performClose(nil)
    }

    // MARK: - Password-gated actions

    /// Shows an uninstall code prompt. Calls completion(true) only if the code
    /// is verified by the helper. Sends a tamper alert on repeated failure.
    func requestUninstallCodeForAction(action: String, completion: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Uninstall code required"
        alert.informativeText = "Enter the uninstall code from your accountability partner's dashboard to \(action)."
        alert.alertStyle = .warning

        let codeField = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        codeField.placeholderString = "XXXX-XXXX"
        alert.accessoryView = codeField
        alert.addButton(withTitle: "Confirm")
        alert.addButton(withTitle: "Cancel")

        attemptCodeVerification(alert: alert, field: codeField, action: action,
                                attemptsLeft: 3, completion: completion)
    }

    private func attemptCodeVerification(alert: NSAlert, field: NSSecureTextField,
                                          action: String, attemptsLeft: Int,
                                          completion: @escaping (Bool) -> Void) {
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else {
            HelperManager.shared.reportTamperAttempt(what: "cancel on \(action) prompt")
            completion(false)
            return
        }

        let entered = field.stringValue
        HelperManager.shared.verifyUninstallCode(entered) { [weak self] ok in
            DispatchQueue.main.async {
                if ok {
                    completion(true)
                } else {
                    let remaining = attemptsLeft - 1
                    let body: String
                    if remaining == 0 {
                        body = "Three failed attempts to \(action)."
                        HelperManager.shared.reportTamperAttempt(what: "3 failed code attempts to \(action)")
                        completion(false)
                        return
                    } else {
                        body = "Wrong code. \(remaining) attempt(s) remaining."
                        HelperManager.shared.reportTamperAttempt(what: "failed code attempt to \(action)")
                    }

                    let retry = NSAlert()
                    retry.messageText = "Wrong code"
                    retry.informativeText = body
                    retry.alertStyle = .critical
                    let retryField = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
                    retryField.placeholderString = "XXXX-XXXX"
                    retry.accessoryView = retryField
                    retry.addButton(withTitle: "Try Again")
                    retry.addButton(withTitle: "Cancel")

                    self?.attemptCodeVerification(alert: retry, field: retryField,
                                                  action: action, attemptsLeft: remaining,
                                                  completion: completion)
                }
            }
        }
    }
}
