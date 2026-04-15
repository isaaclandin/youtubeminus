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

    /// Shows a password prompt. Calls completion(true) only if Jenna's
    /// password is verified by the helper. Sends tamper alert on failure.
    func requestPasswordForAction(action: String, completion: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "This action requires Jenna's password"
        alert.informativeText = "Enter the protection password to \(action)."
        alert.alertStyle = .warning

        let passwordField = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        passwordField.placeholderString = "Protection password"
        alert.accessoryView = passwordField
        alert.addButton(withTitle: "Confirm")
        alert.addButton(withTitle: "Cancel")

        // Attempt counter stored across invocations
        attemptPasswordVerification(alert: alert, field: passwordField, action: action,
                                    attemptsLeft: 3, completion: completion)
    }

    private func attemptPasswordVerification(alert: NSAlert, field: NSSecureTextField,
                                              action: String, attemptsLeft: Int,
                                              completion: @escaping (Bool) -> Void) {
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else {
            // User clicked Cancel — count as a tamper attempt
            HelperManager.shared.reportTamperAttempt(what: "cancel on \(action) prompt")
            completion(false)
            return
        }

        let entered = field.stringValue
        HelperManager.shared.verifyPassword(entered) { [weak self] ok in
            DispatchQueue.main.async {
                if ok {
                    completion(true)
                } else {
                    let remaining = attemptsLeft - 1
                    let body: String
                    if remaining == 0 {
                        body = "Three failed password attempts to \(action)."
                        HelperManager.shared.reportTamperAttempt(what: "3 failed password attempts to \(action)")
                        completion(false)
                        return
                    } else {
                        body = "Wrong password. \(remaining) attempt(s) remaining."
                        HelperManager.shared.reportTamperAttempt(what: "failed password attempt to \(action)")
                    }

                    let retry = NSAlert()
                    retry.messageText = "Wrong password"
                    retry.informativeText = body
                    retry.alertStyle = .critical
                    let retryField = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
                    retryField.placeholderString = "Protection password"
                    retry.accessoryView = retryField
                    retry.addButton(withTitle: "Try Again")
                    retry.addButton(withTitle: "Cancel")

                    self?.attemptPasswordVerification(alert: retry, field: retryField,
                                                      action: action, attemptsLeft: remaining,
                                                      completion: completion)
                }
            }
        }
    }
}
