import Foundation
import Security
import CommonCrypto

/// Reads/writes items in the **system** keychain at
/// /Library/Keychains/System.keychain — only accessible by root.
/// This ensures Isaac (a standard user) cannot read or delete the password.
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

    // MARK: - Password helpers

    /// Store Jenna's password as a salted SHA-256 hash.
    func storePassword(_ password: String) -> Bool {
        let salt = UUID().uuidString
        guard let hash = sha256(password + salt) else { return false }
        return save(value: hash, key: Constants.Keychain.passwordHashKey)
            && save(value: salt, key: Constants.Keychain.passwordSaltKey)
    }

    /// Returns true if the supplied password matches the stored hash.
    func verifyPassword(_ password: String) -> Bool {
        guard let storedHash = load(key: Constants.Keychain.passwordHashKey),
              let salt       = load(key: Constants.Keychain.passwordSaltKey),
              let computed   = sha256(password + salt) else { return false }
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
