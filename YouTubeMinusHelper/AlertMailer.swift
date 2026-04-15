import Foundation

/// Sends tamper-alert emails via the Resend API.
/// Synchronous — called from a background queue in TamperWatcher.
enum AlertMailer {

    static func send(what: String, to recipient: String, resendKey: String) {
        let now = ISO8601DateFormatter().string(from: Date())
        let html = """
        <h2 style="color:#c0392b">⚠️ Accountability app tamper attempt</h2>
        <table style="border-collapse:collapse;font-family:sans-serif">
          <tr><td style="padding:4px 12px 4px 0"><b>What was attempted:</b></td>
              <td>\(what)</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><b>When:</b></td>
              <td>\(now)</td></tr>
        </table>
        <p><a href="\(Constants.dashboardURL)">Open dashboard →</a></p>
        """

        let payload: [String: Any] = [
            "from":    Constants.resendFromAddr,
            "to":      [recipient],
            "subject": "⚠️ Accountability app tamper attempt",
            "html":    html
        ]

        guard let url  = URL(string: "https://api.resend.com/emails"),
              let body = try? JSONSerialization.data(withJSONObject: payload) else { return }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(resendKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        req.timeoutInterval = 10

        // Synchronous send — we're already on a background queue.
        let sema = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: req) { _, resp, err in
            if let code = (resp as? HTTPURLResponse)?.statusCode, code == 200 {
                NSLog("[AlertMailer] Alert sent to \(recipient)")
            } else {
                NSLog("[AlertMailer] Alert send failed: \(err?.localizedDescription ?? "unknown")")
            }
            sema.signal()
        }.resume()
        sema.wait()
    }
}
