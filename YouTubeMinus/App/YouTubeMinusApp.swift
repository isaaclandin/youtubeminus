import SwiftUI

@main
struct YouTubeMinusApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // Pure menu-bar app — no visible window.
        // Settings scene keeps the app alive without a main window.
        Settings { EmptyView() }
    }
}
