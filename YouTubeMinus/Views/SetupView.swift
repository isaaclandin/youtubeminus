import SwiftUI

struct SetupView: View {

    let onComplete: () -> Void

    @State private var step: Step = .welcome
    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage: String?
    @State private var isWorking = false

    // Stored after sign-in, used during install
    @State private var accessToken: String?
    @State private var userId: String?

    enum Step { case welcome, signIn, install, done }

    var body: some View {
        VStack(spacing: 0) {
            ProgressIndicator(step: step)
                .padding(.horizontal, 24)
                .padding(.top, 24)

            Divider().padding(.top, 16)

            Group {
                switch step {
                case .welcome: welcomeStep
                case .signIn:  signInStep
                case .install: installStep
                case .done:    doneStep
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(width: 480, height: 500)
    }

    // MARK: - Steps

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Set up YouTubeMinus", systemImage: "lock.shield")
                .font(.title2.bold())

            Text("""
                YouTubeMinus blocks YouTube on every browser except Chrome, \
                where your accountability extension runs.

                **You can complete this setup on your own.** Sign in to your account \
                and install the enforcement daemon — your accountability partner will \
                automatically receive the uninstall code on their dashboard.
                """)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()

            HStack {
                Spacer()
                Button("Get Started →") { step = .signIn }
                    .buttonStyle(.borderedProminent)
            }
        }
    }

    private var signInStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Sign in to your account", systemImage: "person.circle")
                .font(.title2.bold())

            Text("This links this install to your account so the uninstall code is sent to your partner's dashboard.")
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Divider()

            TextField("Email", text: $email)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()

            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)

            if let err = errorMessage {
                Text(err).foregroundColor(.red).font(.caption)
            }

            if isWorking {
                HStack {
                    ProgressView().scaleEffect(0.8)
                    Text("Signing in…").foregroundColor(.secondary)
                }
            }

            Spacer()

            HStack {
                Button("← Back") { step = .welcome }
                    .disabled(isWorking)
                Spacer()
                Button("Sign In →") { signIn() }
                    .buttonStyle(.borderedProminent)
                    .disabled(email.isEmpty || password.isEmpty || isWorking)
            }
        }
    }

    private var installStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Install enforcement daemon", systemImage: "gearshape.2")
                .font(.title2.bold())

            Text("""
                Click **Install** below. macOS will ask for your **admin password** \
                (your Mac login password).

                The daemon will:
                • Run a local DNS resolver that blocks YouTube on all browsers
                • Apply a Chrome policy so Chrome uses Cloudflare DoH, \
                  allowing YouTube only within Chrome and the extension
                • Start automatically at every login, before the desktop loads
                • Monitor for tampering every 60 seconds
                """)
                .fixedSize(horizontal: false, vertical: true)

            if isWorking {
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
                Button("← Back") { step = .signIn }
                    .disabled(isWorking)
                Spacer()
                Button("Install") { install() }
                    .buttonStyle(.borderedProminent)
                    .disabled(isWorking)
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

            Text("YouTube is now blocked on all browsers except Chrome, where the extension controls access.\n\nYour uninstall code has been sent to your accountability partner's dashboard. Ask them if you ever need to remove this app.\n\nThe 🔒 icon in the menu bar shows the current status.")
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

    private func signIn() {
        isWorking = true
        errorMessage = nil

        Task { @MainActor in
            do {
                let result = try await SupabaseClient.signIn(email: email, password: password)
                accessToken = result.accessToken
                userId = result.userId
                isWorking = false
                step = .install
            } catch {
                isWorking = false
                errorMessage = error.localizedDescription
            }
        }
    }

    private func install() {
        guard let token = accessToken, let uid = userId else {
            errorMessage = "Session expired — please go back and sign in again."
            return
        }

        isWorking = true
        errorMessage = nil

        HelperInstaller.shared.install(accessToken: token, userId: uid) { result in
            DispatchQueue.main.async {
                isWorking = false
                switch result {
                case .success:
                    step = .done
                case .failure(let err):
                    errorMessage = "Installation failed: \(err.localizedDescription)"
                }
            }
        }
    }
}

// MARK: - Progress indicator

private struct ProgressIndicator: View {
    let step: SetupView.Step

    private let steps: [SetupView.Step] = [.welcome, .signIn, .install, .done]

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
