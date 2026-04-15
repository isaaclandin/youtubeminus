import Foundation

/// Sends tamper alerts to Jenna via the Telegram Bot API.
/// Synchronous — called from a background queue in TamperWatcher.
enum AlertMailer {

    static func send(what: String) {
        let now = DateFormatter.localizedString(from: Date(), dateStyle: .short, timeStyle: .medium)
        let text = "⚠️ *Accountability app tamper attempt*\n\n*What:* \(what)\n*When:* \(now)"

        let payload: [String: Any] = [
            "chat_id":    Constants.jennaChatId,
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
                NSLog("[AlertMailer] Tamper alert sent.")
            } else {
                NSLog("[AlertMailer] Alert send failed: \(err?.localizedDescription ?? "unknown")")
            }
            sema.signal()
        }.resume()
        sema.wait()
    }
}
