import Foundation

/// Thin wrapper around the Resend /emails endpoint.
/// Used by both the main app (UI-triggered alerts) and the helper (daemon alerts).
/// The helper has its own copy of this logic in AlertMailer.swift.
struct ResendClient {

    static func sendTamperAlert(
        what: String,
        to: String,
        resendKey: String,
        dashboardURL: String = Constants.dashboardURL,
        completion: ((Bool) -> Void)? = nil
    ) {
        let now = ISO8601DateFormatter().string(from: Date())
        let htmlBody = """
        <h2>⚠️ Accountability app tamper attempt</h2>
        <p><strong>What was attempted:</strong> \(what)</p>
        <p><strong>When:</strong> \(now)</p>
        <p><a href="\(dashboardURL)">Open dashboard →</a></p>
        """

        let payload: [String: Any] = [
            "from":    Constants.resendFromAddr,
            "to":      [to],
            "subject": "⚠️ Accountability app tamper attempt",
            "html":    htmlBody
        ]

        guard let url = URL(string: "https://api.resend.com/emails"),
              let body = try? JSONSerialization.data(withJSONObject: payload) else {
            completion?(false)
            return
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(resendKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body

        URLSession.shared.dataTask(with: req) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            completion?(ok)
        }.resume()
    }
}
