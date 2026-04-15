import Foundation

/// Lightweight Supabase REST client for the macOS app.
/// Used during setup to authenticate the user and push the uninstall code to their profile.
struct SupabaseClient {

    // MARK: - Auth

    struct AuthResult {
        let accessToken: String
        let userId: String
    }

    /// Sign in with email + password. Returns (accessToken, userId) on success.
    static func signIn(email: String, password: String) async throws -> AuthResult {
        let url = URL(string: "\(Constants.supabaseURL)/auth/v1/token?grant_type=password")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Constants.supabaseAnonKey, forHTTPHeaderField: "apikey")

        let body = ["email": email, "password": password]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            // Try to extract Supabase error message
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = json["error_description"] as? String {
                throw SupabaseError.authFailed(msg)
            }
            throw SupabaseError.authFailed("Invalid email or password.")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["access_token"] as? String,
              let user  = json["user"] as? [String: Any],
              let userId = user["id"] as? String else {
            throw SupabaseError.invalidResponse
        }

        return AuthResult(accessToken: token, userId: userId)
    }

    // MARK: - Profile

    /// Writes the plaintext uninstall code to the authenticated user's profile row.
    static func storeUninstallCode(_ code: String, userId: String, accessToken: String) async throws {
        let url = URL(string: "\(Constants.supabaseURL)/rest/v1/profiles?id=eq.\(userId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Constants.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")

        let body = ["uninstall_code": code]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw SupabaseError.updateFailed
        }
    }

    // MARK: - Relationships

    /// Returns the Telegram chat IDs of all active accountability partners for this user.
    static func fetchPartnerChatIds(userId: String, accessToken: String) async throws -> [String] {
        // Select active relationships where this user is the owner, join partner profile
        let url = URL(string: "\(Constants.supabaseURL)/rest/v1/relationships?owner_id=eq.\(userId)&status=eq.active&select=partner:profiles!partner_id(telegram_chat_id)")!
        var request = URLRequest(url: url)
        request.setValue(Constants.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, _) = try await URLSession.shared.data(for: request)

        // Response shape: [{ "partner": { "telegram_chat_id": "123456" } }]
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }

        return rows.compactMap { row -> String? in
            guard let partner = row["partner"] as? [String: Any],
                  let chatId  = partner["telegram_chat_id"] as? String,
                  !chatId.isEmpty else { return nil }
            return chatId
        }
    }

    // MARK: - Errors

    enum SupabaseError: LocalizedError {
        case authFailed(String)
        case invalidResponse
        case updateFailed

        var errorDescription: String? {
            switch self {
            case .authFailed(let msg): return msg
            case .invalidResponse: return "Unexpected response from server."
            case .updateFailed: return "Failed to save uninstall code to your account."
            }
        }
    }
}
