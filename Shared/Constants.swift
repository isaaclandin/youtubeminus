import Foundation

enum Constants {
    // Bundle identifiers
    static let appBundleID = "com.youtubeminus.app"
    static let helperBundleID = "com.youtubeminus.helper"
    static let helperMachService = "com.youtubeminus.helper"

    // ── Helper install paths (daemon lives here independently of the app) ──────
    static let helperInstallPath  = "/Library/PrivilegedHelperTools/YouTubeMinusHelper"
    static let daemonPlistPath    = "/Library/LaunchDaemons/com.youtubeminus.helper.plist"
    static let supportDir         = "/Library/Application Support/YouTubeMinus"
    static let pfRulesPath        = "/Library/Application Support/YouTubeMinus/pf.rules"
    static let pfAnchorName       = "com.youtubeminus"
    static let proxyPACPath       = "/Library/Application Support/YouTubeMinus/proxy.pac"

    // Domains the DNS resolver will return NXDOMAIN for
    static let blockedDomains: Set<String> = [
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "m.youtube.com",
        "youtube-nocookie.com",
        "yt.be",
        "youtubei.googleapis.com"
    ]

    // DNS
    static let upstreamDNS1 = "8.8.8.8"
    static let upstreamDNS2 = "1.1.1.1"
    static let localDNSHost = "127.0.0.1"
    static let dnsPort: UInt16 = 53

    // Chrome policy — DoH (bypasses our local DNS resolver) + proxy PAC for IP-level bypass
    static let chromeDoHMode       = "secure"
    static let chromeDoHTemplate   = "https://cloudflare-dns.com/dns-query{?dns}"
    static let chromePolicyPath    = "/Library/Managed Preferences/com.google.Chrome.plist"

    // Chrome proxy — CONNECT proxy that runs as root so pf allows its outbound
    // connections to YouTube IPs while blocking all other user-space processes.
    static let chromeProxyPort: UInt16 = 8765

    // ── Fill in your Chrome extension ID ─────────────────────────────────────
    // Get this from chrome://extensions after loading the accountability extension.
    // Format: "extensionid;https://clients2.google.com/service/update2/crx"
    static let chromeExtensionID = "nfpollkoadmhhcfpoaakjnefajphoccj"
    // ─────────────────────────────────────────────────────────────────────────

    // YouTube IP ranges (Google ASN 15169 subsets most likely to serve youtube.com)
    // These change occasionally; DNS blocking is the primary layer.
    // pf blocks these for all UIDs except root (our proxy daemon).
    static let youtubeIPRanges: [String] = [
        "172.217.0.0/16",
        "172.253.0.0/16",
        "142.250.0.0/15",
        "74.125.0.0/16",
        "209.85.128.0/17",
        "216.58.192.0/19",
        "216.239.32.0/19",
        "64.233.160.0/19",
        "66.102.0.0/20",
        "108.177.8.0/21",
        "35.186.0.0/16",
        "34.64.0.0/10"
    ]

    // Tamper check interval
    static let tamperCheckInterval: TimeInterval = 60

    // Keychain (stored in system keychain — only root can access)
    enum Keychain {
        static let service          = "com.youtubeminus"
        static let passwordHashKey  = "protection-password-hash"
        static let passwordSaltKey  = "protection-password-salt"
        static let jennaEmailKey    = "jenna-email"
        static let resendKeyKey     = "resend-api-key"
    }

    // ── Telegram (tamper alerts from the macOS helper) ───────────────────────
    static let telegramBotToken = "8736854276:AAEt6MCpPyenNX3Hda5St-uLTvIo33kLs-A"
    static let jennaChatId      = "6770280815" // temp: Isaac's ID until Jenna sets up Telegram
    static let isaacChatId      = "6770280815"
    // ─────────────────────────────────────────────────────────────────────────
}
