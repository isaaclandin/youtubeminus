import Foundation
import Security

/// Reads/writes items in the **user** keychain from the main app process.
/// Sensitive items (password hash) live in the system keychain managed by the
/// privileged helper — this helper is only for non-sensitive app preferences.
enum KeychainHelper {

    @discardableResult
    static func save(_ value: String, forKey key: String) -> Bool {
        let data = Data(value.utf8)
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: Constants.Keychain.service as CFString,
            kSecAttrAccount: key as CFString,
            kSecValueData:   data
        ]
        SecItemDelete(query as CFDictionary)
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func load(forKey key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass:            kSecClassGenericPassword,
            kSecAttrService:      Constants.Keychain.service as CFString,
            kSecAttrAccount:      key as CFString,
            kSecReturnData:       kCFBooleanTrue!,
            kSecMatchLimit:       kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func delete(forKey key: String) -> Bool {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: Constants.Keychain.service as CFString,
            kSecAttrAccount: key as CFString
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }
}
