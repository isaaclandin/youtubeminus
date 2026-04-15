import Foundation

/// Resolves hostnames via Cloudflare's DNS-over-HTTPS endpoint.
///
/// Used by ChromeProxy so it can resolve YouTube domains to IPs without
/// going through the system DNS (which our DNSServer returns NXDOMAIN for).
/// Synchronous — must be called from a non-main thread.
enum DoHResolver {

    private static let endpoint = URL(string: "https://cloudflare-dns.com/dns-query")!

    /// Returns the first IPv4 address for `hostname`, or nil on failure.
    static func resolve(_ hostname: String, timeout: TimeInterval = 5) -> String? {
        // Build RFC 8484 DoH GET request
        guard var comps = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
            return nil
        }
        comps.queryItems = [
            URLQueryItem(name: "name", value: hostname),
            URLQueryItem(name: "type", value: "A")
        ]
        guard let url = comps.url else { return nil }

        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.setValue("application/dns-json", forHTTPHeaderField: "Accept")

        var result: String?
        let sema = DispatchSemaphore(value: 0)

        URLSession.shared.dataTask(with: req) { data, _, _ in
            defer { sema.signal() }
            guard let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let answers = json["Answer"] as? [[String: Any]] else { return }

            // Pick the first A record (type 1)
            result = answers
                .filter { ($0["type"] as? Int) == 1 }
                .compactMap { $0["data"] as? String }
                .first
        }.resume()

        sema.wait()
        return result
    }
}
