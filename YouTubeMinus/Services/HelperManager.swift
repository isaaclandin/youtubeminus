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

    func verifyUninstallCode(_ code: String, reply: @escaping (Bool) -> Void) {
        proxy()?.verifyUninstallCode(code, reply: reply) ?? reply(false)
    }

    func setUninstallCode(_ code: String, reply: @escaping (Bool) -> Void) {
        proxy()?.setUninstallCode(code, reply: reply) ?? reply(false)
    }

    func setPartnerChatIds(_ ids: [String], reply: @escaping (Bool) -> Void) {
        proxy()?.setPartnerChatIds(ids.joined(separator: "\n"), reply: reply) ?? reply(false)
    }

    func reportTamperAttempt(what: String) {
        proxy()?.checkAndRestoreNow(reason: what) { _ in }
    }
}
