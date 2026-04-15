import SwiftUI

struct SetupView: View {

    let onComplete: () -> Void

    @State private var step: Step = .welcome
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var errorMessage: String?
    @State private var isInstalling = false

    enum Step { case welcome, credentials, install, done }

    var body: some View {
        VStack(spacing: 0) {
            // Progress bar
            ProgressIndicator(step: step)
                .padding(.horizontal, 24)
                .padding(.top, 24)

            Divider().padding(.top, 16)

            // Content
            Group {
                switch step {
                case .welcome:    welcomeStep
                case .credentials: credentialsStep
                case .install:    installStep
                case .done:       doneStep
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(width: 480, height: 520)
    }

    // MARK: Steps

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Set up YouTubeMinus", systemImage: "lock.shield")
                .font(.title2.bold())

            Text("""
                YouTubeMinus blocks YouTube on every browser except Chrome, \
                where your accountability extension runs.

                **This setup must be completed by Jenna.** You will:
                1. Enter Jenna's email for tamper alerts
                2. Set a protection password only Jenna knows
                3. Install the system enforcement daemon (requires admin password)
                """)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()

            HStack {
                Spacer()
                Button("Get Started →") { step = .credentials }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private var credentialsStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Set the protection password", systemImage: "person.badge.key")
                .font(.title2.bold())

            Text("Isaac will never see this. Store it somewhere only you can access.")
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text("Tamper alerts will be sent to Jenna's Telegram account automatically.")
                .foregroundColor(.secondary)
                .font(.caption)
                .fixedSize(horizontal: false, vertical: true)

            Divider()

            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)

            SecureField("Confirm password", text: $confirmPassword)
                .textFieldStyle(.roundedBorder)

            if let err = errorMessage {
                Text(err).foregroundColor(.red).font(.caption)
            }

            Spacer()

            HStack {
                Button("← Back") { step = .welcome }
                Spacer()
                Button("Continue →") { validateAndAdvance() }
                    .buttonStyle(.borderedProminent)
                    .disabled(password.isEmpty)
            }
        }
    }

    private var installStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Install enforcement daemon", systemImage: "gearshape.2")
                .font(.title2.bold())

            Text("""
                Click **Install** below. macOS will ask for the **admin** password \
                (the computer login password — this is separate from the protection password).

                The daemon will:
                • Run a local DNS resolver that blocks YouTube on all browsers
                • Apply a Chrome policy so Chrome uses Cloudflare DoH instead, \
                  allowing YouTube only within Chrome
                • Start automatically at every login, before the desktop loads
                • Monitor for tampering every 60 seconds
                """)
                .fixedSize(horizontal: false, vertical: true)

            if isInstalling {
                HStack {
                    ProgressView().scaleEffect(0.8)
                    Text("Installing…").foregroundColor(.secondary)
                }
            }

            if let err = errorMessage {
                Text(err).foregroundColor(.red).font(.caption)
            }

            Spacer()

            HStack {
                Button("← Back") { step = .credentials }
                    .disabled(isInstalling)
                Spacer()
                Button("Install") { install() }
                    .buttonStyle(.borderedProminent)
                    .disabled(isInstalling)
            }
        }
    }

    private var doneStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 64))
                .foregroundColor(.green)

            Text("YouTubeMinus is active")
                .font(.title.bold())

            Text("YouTube is now blocked on Safari, Firefox, Arc, and every other browser. Chrome resolves YouTube normally — the extension controls access from there.\n\nThe 🔒 icon in the menu bar shows the current status.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)

            Button("Done") {
                onComplete()
                NSApp.windows.first(where: { $0.title == "YouTubeMinus Setup" })?.close()
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Logic

    private func validateAndAdvance() {
        errorMessage = nil
        guard password == confirmPassword else {
            errorMessage = "Passwords do not match."
            return
        }
        guard password.count >= 8 else {
            errorMessage = "Password must be at least 8 characters."
            return
        }
        step = .install
    }

    private func install() {
        isInstalling = true
        errorMessage = nil

        HelperInstaller.shared.install(password: password) { result in
            DispatchQueue.main.async {
                isInstalling = false
                switch result {
                case .success:
                    step = .done
                case .failure(let err):
                    errorMessage = "Installation failed: \(err.localizedDescription)"
                }
            }
        }
    }

    // MARK: - Helper views

    private func field(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            TextField("", text: text).textFieldStyle(.roundedBorder)
        }
    }
}

// MARK: - Progress indicator

private struct ProgressIndicator: View {
    let step: SetupView.Step

    private let steps: [SetupView.Step] = [.welcome, .credentials, .install, .done]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(steps.indices, id: \.self) { idx in
                let s = steps[idx]
                let isCurrent = s == step
                let isPast = steps.firstIndex(of: step)! > idx
                Circle()
                    .fill(isPast ? Color.accentColor : (isCurrent ? Color.accentColor.opacity(0.6) : Color.secondary.opacity(0.3)))
                    .frame(width: 8, height: 8)

                if idx < steps.count - 1 {
                    Rectangle()
                        .fill(isPast ? Color.accentColor : Color.secondary.opacity(0.2))
                        .frame(height: 2)
                }
            }
        }
    }
}
