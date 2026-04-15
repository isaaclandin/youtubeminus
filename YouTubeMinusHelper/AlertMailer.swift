import Foundation

/// Sends tamper alerts to all accountability partners via the Telegram Bot API.
/// Partner chat IDs are cached in the system keychain during setup (root-only).
enum AlertMailer {

    static func send(what: String) {
        let keychain = HelperKeychain()
        let chatIds  = keychain.loadPartnerChatIds()

        let now  = DateFormatter.localizedString(from: Date(), dateStyle: .short, timeStyle: .medium)
        let text = "⚠️ *Accountability app tamper attempt*\n\n*What:* \(what)\n*When:* \(now)"

        if chatIds.isEmpty {
            NSLog("[AlertMailer] No partner chat IDs cached — tamper alert not sent: \(what)")
            return
        }

        for chatId in chatIds {
            sendTelegramMessage(chatId: chatId, text: text)
        }
    }

    // MARK: - Private

    private static func sendTelegramMessage(chatId: String, text: String) {
        let payload: [String: Any] = [
            "chat_id":    chatId,
            "text":       text,
            "parse_mode": "Markdown",
        ]

        guard let url  = URL(string: "https://api.telegram.org/bot\(Constants.telegramBotToken)/sendMessage"),
              let body = try? JSONSerialization.data(withJSONObject: payload) else { return }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        req.timeoutInterval = 10

        let sema = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: req) { _, resp, err in
            if let code = (resp as? HTTPURLResponse)?.statusCode, code == 200 {
                NSLog("[AlertMailer] Tamper alert sent to \(chatId)")
            } else {
                NSLog("[AlertMailer] Alert to \(chatId) failed: \(err?.localizedDescription ?? "unknown")")
            }
            sema.signal()
        }.resume()
        sema.wait()
    }
}
