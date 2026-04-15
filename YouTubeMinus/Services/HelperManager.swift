import Foundation

/// Manages the XPC connection from the main app to the privileged helper.
final class HelperManager {

    static let shared = HelperManager()
    private init() {}

    private var connection: NSXPCConnection?

    // MARK: - Connection

    private func proxy() -> YouTubeMinusXPCProtocol? {
        if connection == nil {
            let conn = NSXPCConnection(machServiceName: Constants.helperMachService,
                                      options: .privileged)
            conn.remoteObjectInterface = NSXPCInterface(with: YouTubeMinusXPCProtocol.self)
            conn.invalidationHandler = { [weak self] in
                self?.connection = nil
            }
            conn.resume()
            connection = conn
        }
        return connection?.remoteObjectProxy as? YouTubeMinusXPCProtocol
    }

    // MARK: - Public API

    func getStatus(reply: @escaping ([String: Any]) -> Void) {
        proxy()?.getStatus(reply: reply) ?? reply([:])
    }

    func verifyPassword(_ password: String, reply: @escaping (Bool) -> Void) {
        proxy()?.verifyPassword(password, reply: reply) ?? reply(false)
    }

    func setPassword(_ password: String, jennaEmail: String,
                     resendKey: String, reply: @escaping (Bool) -> Void) {
        proxy()?.setPassword(password, jennaEmail: jennaEmail,
                             resendKey: resendKey, reply: reply) ?? reply(false)
    }

    func reportTamperAttempt(what: String) {
        proxy()?.checkAndRestoreNow(reason: what) { _ in }
    }
}
