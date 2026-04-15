import Foundation
import Security
import CommonCrypto

/// Reads/writes items in the **system** keychain at
/// /Library/Keychains/System.keychain — only accessible by root.
/// This ensures the device owner cannot read or delete the uninstall code.
struct HelperKeychain {

    private let keychainPath = "/Library/Keychains/System.keychain"

    // MARK: - Save / Load

    func save(value: String, key: String) -> Bool {
        guard let keychain = openSystemKeychain() else { return false }
        let data = Data(value.utf8)

        // Delete any existing item first
        var query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: Constants.Keychain.service as CFString,
            kSecAttrAccount: key as CFString,
            kSecUseKeychain: keychain
        ]
        SecItemDelete(query as CFDictionary)

        query[kSecValueData] = data
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    func load(key: String) -> String? {
        guard let keychain = openSystemKeychain() else { return nil }
        let query: [CFString: Any] = [
            kSecClass:        kSecClassGenericPassword,
            kSecAttrService:  Constants.Keychain.service as CFString,
            kSecAttrAccount:  key as CFString,
            kSecReturnData:   kCFBooleanTrue!,
            kSecMatchLimit:   kSecMatchLimitOne,
            kSecUseKeychain:  keychain
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - Partner chat ID helpers

    /// Store a list of partner Telegram chat IDs (newline-separated).
    func storePartnerChatIds(_ ids: [String]) -> Bool {
        save(value: ids.joined(separator: "\n"), key: Constants.Keychain.partnerChatIds)
    }

    /// Load the stored partner chat IDs. Returns [] if none stored.
    func loadPartnerChatIds() -> [String] {
        guard let raw = load(key: Constants.Keychain.partnerChatIds) else { return [] }
        return raw.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
    }

    // MARK: - Uninstall code helpers

    /// Store the uninstall code as a salted SHA-256 hash.
    func storeUninstallCode(_ code: String) -> Bool {
        let salt = UUID().uuidString
        guard let hash = sha256(code + salt) else { return false }
        return save(value: hash, key: Constants.Keychain.uninstallCodeHash)
            && save(value: salt, key: Constants.Keychain.uninstallCodeSalt)
    }

    /// Returns true if the supplied code matches the stored hash.
    func verifyUninstallCode(_ code: String) -> Bool {
        guard let storedHash = load(key: Constants.Keychain.uninstallCodeHash),
              let salt       = load(key: Constants.Keychain.uninstallCodeSalt),
              let computed   = sha256(code + salt) else { return false }
        return computed == storedHash
    }

    // MARK: - Private

    private func openSystemKeychain() -> SecKeychain? {
        var kc: SecKeychain?
        let status = SecKeychainOpen(keychainPath, &kc)
        return status == errSecSuccess ? kc : nil
    }

    private func sha256(_ input: String) -> String? {
        guard let data = input.data(using: .utf8) else { return nil }
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes {
            _ = CC_SHA256($0.baseAddress, CC_LONG(data.count), &digest)
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
