import SwiftUI

struct StatusPopoverView: View {

    weak var menuBarController: MenuBarController?

    @StateObject private var vm = StatusViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // Header
            HStack(spacing: 8) {
                Image(systemName: "lock.fill")
                    .foregroundColor(.green)
                    .font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text("YouTubeMinus")
                        .font(.headline)
                    Text("Enforcing block on all browsers")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color(NSColor.windowBackgroundColor))

            Divider()

            // Status indicators
            VStack(alignment: .leading, spacing: 8) {
                StatusRow(label: "DNS resolver", active: vm.dnsActive)
                StatusRow(label: "System DNS configured", active: vm.dnsConfigured)
                StatusRow(label: "Chrome DoH policy", active: vm.policyInstalled)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            // Actions
            VStack(spacing: 8) {
                Button(action: requestYouTubeVideo) {
                    Label("Request a YouTube video", systemImage: "play.rectangle")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)

                Button(action: openDashboard) {
                    Label("Open dashboard", systemImage: "safari")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
            }
            .padding(.vertical, 4)

            Divider()

            // Bottom — quit is password-gated, no disable option
            HStack {
                Text("v\(Bundle.main.shortVersionString)")
                    .font(.caption2)
                    .foregroundColor(Color(NSColor.tertiaryLabelColor))
                Spacer()
                Button("Quit…") {
                    menuBarController?.closePopover()
                    // applicationShouldTerminate intercepts this and asks for password
                    NSApp.terminate(nil)
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .frame(width: 280)
        .onAppear { vm.refresh() }
    }

    private func requestYouTubeVideo() {
        menuBarController?.closePopover()
        // Open Chrome directly to YouTube search — the extension handles approval
        let url = URL(string: "https://www.youtube.com/results")!
        var config = NSWorkspace.OpenConfiguration()
        // Try to open specifically in Chrome
        if let chrome = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.google.Chrome") {
            NSWorkspace.shared.open([url], withApplicationAt: chrome,
                                    configuration: config, completionHandler: nil)
        } else {
            NSWorkspace.shared.open(url)
        }
    }

    private func openDashboard() {
        menuBarController?.closePopover()
        if let url = URL(string: "https://isaaclandin.github.io/youtubeminus/dashboard") {
            NSWorkspace.shared.open(url)
        }
    }
}

// MARK: - Subviews

private struct StatusRow: View {
    let label: String
    let active: Bool

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(active ? Color.green : Color.red)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.callout)
            Spacer()
            Text(active ? "active" : "error")
                .font(.caption)
                .foregroundColor(active ? .green : .red)
        }
    }
}

// MARK: - View model

@MainActor
final class StatusViewModel: ObservableObject {
    @Published var dnsActive = false
    @Published var dnsConfigured = false
    @Published var policyInstalled = false

    func refresh() {
        HelperManager.shared.getStatus { status in
            Task { @MainActor in
                self.dnsActive        = status["dnsActive"]      as? Bool ?? false
                self.dnsConfigured    = status["dnsConfigured"]   as? Bool ?? false
                self.policyInstalled  = status["policyInstalled"] as? Bool ?? false
            }
        }
    }
}

// MARK: - Helpers

private extension Bundle {
    var shortVersionString: String {
        infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }
}
