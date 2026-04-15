import Foundation
import Darwin

/// Minimal UDP DNS resolver that:
///   • returns NXDOMAIN for YouTube domains
///   • forwards everything else to 8.8.8.8 / 1.1.1.1 with a 2-second timeout
///
/// Runs on 127.0.0.1:53 (requires root). Single-threaded receive loop with
/// concurrent dispatch for forwarding so slow upstream calls don't block.
final class DNSServer {

    private(set) var isRunning = false
    private var sock: Int32 = -1
    private let queue = DispatchQueue(label: "com.youtubeminus.dns",
                                      attributes: .concurrent)

    // MARK: - Start / Stop

    func start() throws {
        sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard sock >= 0 else {
            throw DNSError.socketFailed(errno)
        }

        var yes: Int32 = 1
        setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_len    = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port   = Constants.dnsPort.bigEndian
        addr.sin_addr.s_addr = inet_addr(Constants.localDNSHost)
        memset(&addr.sin_zero, 0, MemoryLayout.size(ofValue: addr.sin_zero))

        let bound = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else { throw DNSError.bindFailed(errno) }

        isRunning = true
        queue.async { [weak self] in self?.receiveLoop() }
        NSLog("[DNSServer] Listening on 127.0.0.1:53")
    }

    func stop() {
        isRunning = false
        if sock >= 0 { close(sock); sock = -1 }
    }

    // MARK: - Receive loop

    private func receiveLoop() {
        var buf = [UInt8](repeating: 0, count: 512)
        var clientAddr = sockaddr_in()
        var clientLen  = socklen_t(MemoryLayout<sockaddr_in>.size)

        while isRunning {
            let n = withUnsafeMutablePointer(to: &clientAddr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    recvfrom(sock, &buf, buf.count, 0, $0, &clientLen)
                }
            }
            guard n > 0 else { continue }

            let packet = Array(buf.prefix(n))
            let client = clientAddr

            queue.async { [weak self] in
                guard let self else { return }
                let response = self.handle(packet)
                _ = withUnsafePointer(to: client) {
                    $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                        sendto(self.sock, response, response.count, 0, $0,
                               socklen_t(MemoryLayout<sockaddr_in>.size))
                    }
                }
            }
        }
    }

    // MARK: - Packet handling

    private func handle(_ data: [UInt8]) -> [UInt8] {
        guard data.count >= 12 else { return nxdomain(from: data) }

        if let domain = parseDomain(from: data), isBlocked(domain) {
            NSLog("[DNSServer] Blocking: \(domain)")
            return nxdomain(from: data)
        }

        return forward(data) ?? nxdomain(from: data)
    }

    // MARK: - Domain parsing

    private func parseDomain(from data: [UInt8]) -> String? {
        var offset = 12  // skip the 12-byte header
        var labels: [String] = []

        while offset < data.count {
            let len = Int(data[offset])
            if len == 0 { break }                        // root label
            if len & 0xC0 == 0xC0 { break }              // compression pointer — give up
            guard offset + 1 + len <= data.count else { return nil }
            if let label = String(bytes: data[(offset+1)..<(offset+1+len)], encoding: .ascii) {
                labels.append(label)
            }
            offset += 1 + len
        }

        return labels.isEmpty ? nil : labels.joined(separator: ".").lowercased()
    }

    private func isBlocked(_ domain: String) -> Bool {
        Constants.blockedDomains.contains { blocked in
            domain == blocked || domain.hasSuffix("." + blocked)
        }
    }

    // MARK: - NXDOMAIN response

    private func nxdomain(from query: [UInt8]) -> [UInt8] {
        guard query.count >= 12 else { return query }
        var r = query
        // Byte 2: QR=1 (response), Opcode=0, AA=0, TC=0, RD=copy from query
        r[2] = 0x80 | (r[2] & 0x01)   // QR=1, RD preserved
        // Byte 3: RA=1, RCODE=3 (NXDOMAIN)
        r[3] = 0x83
        // Zero out ANCOUNT, NSCOUNT, ARCOUNT
        r[6]=0; r[7]=0; r[8]=0; r[9]=0; r[10]=0; r[11]=0
        return r
    }

    // MARK: - Upstream forwarding

    private func forward(_ query: [UInt8]) -> [UInt8]? {
        // Try primary, then secondary upstream
        return forwardTo(Constants.upstreamDNS1, query: query)
            ?? forwardTo(Constants.upstreamDNS2, query: query)
    }

    private func forwardTo(_ host: String, query: [UInt8]) -> [UInt8]? {
        let s = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
        guard s >= 0 else { return nil }
        defer { close(s) }

        var tv = timeval(tv_sec: 2, tv_usec: 0)
        setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

        var upstream = sockaddr_in()
        upstream.sin_family = sa_family_t(AF_INET)
        upstream.sin_port   = (53 as UInt16).bigEndian
        upstream.sin_addr.s_addr = inet_addr(host)

        let sent = withUnsafePointer(to: upstream) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                sendto(s, query, query.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard sent == query.count else { return nil }

        var buf = [UInt8](repeating: 0, count: 4096)
        let n = recv(s, &buf, buf.count, 0)
        guard n > 0 else { return nil }
        return Array(buf.prefix(n))
    }

    // MARK: - Errors

    enum DNSError: Error {
        case socketFailed(Int32)
        case bindFailed(Int32)
    }
}
