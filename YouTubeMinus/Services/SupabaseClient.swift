import Foundation
import Security

/// Lightweight Supabase REST client for the macOS app.
/// Used during setup to authenticate the user and push the uninstall code to their profile.
struct SupabaseClient {

    // MARK: - Session persistence

    /// Stored in the user's login keychain so it survives app restarts without re-login.
    private static let sessionService = "com.youtubeminus.session"
    private static let sessionAccount = "user-session"

    static func saveSession(userId: String, refreshToken: String) {
        let value = "\(userId)|\(refreshToken)"
        guard let data = value.data(using: .utf8) else { return }
        let query: [CFString: Any] = [
            kSecClass:              kSecClassGenericPassword,
            kSecAttrService:        sessionService as CFString,
            kSecAttrAccount:        sessionAccount as CFString,
            kSecValueData:          data,
            kSecAttrAccessible:     kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    /// Returns (userId, refreshToken) or nil if no session is stored.
    static func loadStoredSession() -> (userId: String, refreshToken: String)? {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: sessionService as CFString,
            kSecAttrAccount: sessionAccount as CFString,
            kSecReturnData:  kCFBooleanTrue!,
            kSecMatchLimit:  kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let str  = String(data: data, encoding: .utf8) else { return nil }
        let parts = str.split(separator: "|", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return nil }
        return (userId: parts[0], refreshToken: parts[1])
    }

    static func clearStoredSession() {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: sessionService as CFString,
            kSecAttrAccount: sessionAccount as CFString,
        ]
        SecItemDelete(query as CFDictionary)
    }

    // MARK: - Auth

    struct AuthResult {
        let accessToken: String
        let userId: String
    }

    /// Sign in with email + password. Persists the refresh token for future launches.
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
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = json["error_description"] as? String {
                throw SupabaseError.authFailed(msg)
            }
            throw SupabaseError.authFailed("Invalid email or password.")
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token        = json["access_token"]  as? String,
              let refreshToken = json["refresh_token"] as? String,
              let user         = json["user"]          as? [String: Any],
              let userId       = user["id"]            as? String else {
            throw SupabaseError.invalidResponse
        }

        saveSession(userId: userId, refreshToken: refreshToken)
        return AuthResult(accessToken: token, userId: userId)
    }

    /// Exchange a stored refresh token for a new access token.
    /// Automatically saves the new refresh token on success.
    static func refreshSession(userId: String, refreshToken: String) async throws -> AuthResult {
        let url = URL(string: "\(Constants.supabaseURL)/auth/v1/token?grant_type=refresh_token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Constants.supabaseAnonKey, forHTTPHeaderField: "apikey")

        let body = ["refresh_token": refreshToken]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw SupabaseError.authFailed("Session refresh failed — re-login required.")
        }

        guard let json         = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let newToken     = json["access_token"]  as? String,
              let newRefresh   = json["refresh_token"] as? String else {
            throw SupabaseError.invalidResponse
        }

        saveSession(userId: userId, refreshToken: newRefresh)
        return AuthResult(accessToken: newToken, userId: userId)
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
        let url = URL(string: "\(Constants.supabaseURL)/rest/v1/relationships?owner_id=eq.\(userId)&status=eq.active&select=partner:profiles!partner_id(telegram_chat_id)")!
        var request = URLRequest(url: url)
        request.setValue(Constants.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, _) = try await URLSession.shared.data(for: request)

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
