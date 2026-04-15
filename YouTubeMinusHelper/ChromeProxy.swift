import Foundation
import Darwin

/// HTTP CONNECT proxy that runs as root on 127.0.0.1:\(Constants.chromeProxyPort).
///
/// Chrome is configured (via enterprise policy PAC script) to route YouTube
/// traffic through this proxy.  Because the proxy runs as root (UID 0), pf
/// allows its outbound connections to YouTube IP ranges while blocking all
/// user-space processes.
///
/// Only YouTube-related domains are proxied; everything else gets 403.
/// This prevents other apps from discovering and abusing the proxy even if
/// they somehow learn its address.
final class ChromeProxy {

    private var serverSock: Int32 = -1
    private let queue = DispatchQueue(label: "com.youtubeminus.proxy",
                                      attributes: .concurrent)

    // MARK: - Start / Stop

    func start() throws {
        serverSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
        guard serverSock >= 0 else { throw ProxyError.socketFailed(errno) }

        var yes: Int32 = 1
        setsockopt(serverSock, SOL_SOCKET, SO_REUSEADDR, &yes,
                   socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_len    = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port   = Constants.chromeProxyPort.bigEndian
        addr.sin_addr.s_addr = inet_addr(Constants.localDNSHost)
        memset(&addr.sin_zero, 0, MemoryLayout.size(ofValue: addr.sin_zero))

        let bound = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(serverSock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else { throw ProxyError.bindFailed(errno) }
        guard listen(serverSock, 64) == 0 else { throw ProxyError.listenFailed(errno) }

        queue.async { [weak self] in self?.acceptLoop() }
        NSLog("[ChromeProxy] Listening on 127.0.0.1:\(Constants.chromeProxyPort)")
    }

    func stop() {
        if serverSock >= 0 { close(serverSock); serverSock = -1 }
    }

    // MARK: - Accept loop

    private func acceptLoop() {
        while serverSock >= 0 {
            let client = accept(serverSock, nil, nil)
            guard client >= 0 else { continue }
            queue.async { [weak self] in
                self?.handle(client)
            }
        }
    }

    // MARK: - CONNECT handling

    private func handle(_ clientSock: Int32) {
        defer { close(clientSock) }

        // Read until we have a full CONNECT request header (ends with \r\n\r\n)
        var headerData = Data()
        var buf = [UInt8](repeating: 0, count: 4096)
        while !headerData.hasCRLFTerminator {
            let n = recv(clientSock, &buf, buf.count, 0)
            guard n > 0 else { return }
            headerData.append(contentsOf: buf.prefix(n))
            if headerData.count > 8192 { return }  // too large — abort
        }

        guard let header = String(data: headerData, encoding: .utf8),
              let (host, port) = parseCONNECT(header) else {
            sendResponse(clientSock, status: 400, message: "Bad Request")
            return
        }

        // Only proxy YouTube-related domains
        guard isAllowedHost(host) else {
            NSLog("[ChromeProxy] Refused CONNECT to non-YouTube host: \(host)")
            sendResponse(clientSock, status: 403, message: "Forbidden")
            return
        }

        // Resolve hostname via DoH (bypasses our system DNS which returns NXDOMAIN)
        guard let ip = DoHResolver.resolve(host) else {
            NSLog("[ChromeProxy] DoH resolution failed for: \(host)")
            sendResponse(clientSock, status: 502, message: "Bad Gateway")
            return
        }

        // Connect to the upstream server
        guard let upstreamSock = connectTo(ip: ip, port: port) else {
            NSLog("[ChromeProxy] Could not connect to \(ip):\(port)")
            sendResponse(clientSock, status: 502, message: "Bad Gateway")
            return
        }
        defer { close(upstreamSock) }

        // Signal to client that the tunnel is open
        sendResponse(clientSock, status: 200, message: "Connection Established")

        // Relay bytes bidirectionally until one side closes
        relay(clientSock, upstreamSock)
    }

    // MARK: - Relay

    private func relay(_ a: Int32, _ b: Int32) {
        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global().async {
            self.copy(from: a, to: b)
            shutdown(b, SHUT_WR)
            group.leave()
        }
        group.enter()
        DispatchQueue.global().async {
            self.copy(from: b, to: a)
            shutdown(a, SHUT_WR)
            group.leave()
        }
        group.wait()
    }

    private func copy(from src: Int32, to dst: Int32) {
        var buf = [UInt8](repeating: 0, count: 65536)
        while true {
            let n = recv(src, &buf, buf.count, 0)
            guard n > 0 else { return }
            var sent = 0
            while sent < n {
                let s = Darwin.send(dst, Array(buf[sent..<n]), n - sent, 0)
                guard s > 0 else { return }
                sent += s
            }
        }
    }

    // MARK: - Connect to upstream

    private func connectTo(ip: String, port: Int) -> Int32? {
        let sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
        guard sock >= 0 else { return nil }

        var tv = timeval(tv_sec: 10, tv_usec: 0)
        setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port   = UInt16(port).bigEndian
        addr.sin_addr.s_addr = inet_addr(ip)

        let connected = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        if connected != 0 { close(sock); return nil }
        return sock
    }

    // MARK: - Helpers

    private func parseCONNECT(_ header: String) -> (host: String, port: Int)? {
        // "CONNECT host:port HTTP/1.1\r\n..."
        let lines = header.components(separatedBy: "\r\n")
        guard let first = lines.first,
              first.hasPrefix("CONNECT ") else { return nil }
        let parts = first.components(separatedBy: " ")
        guard parts.count >= 2 else { return nil }
        let hostPort = parts[1].components(separatedBy: ":")
        guard let host = hostPort.first, !host.isEmpty else { return nil }
        let port = hostPort.count > 1 ? Int(hostPort[1]) ?? 443 : 443
        return (host, port)
    }

    private func isAllowedHost(_ host: String) -> Bool {
        let h = host.lowercased()
        return Constants.blockedDomains.contains { domain in
            h == domain || h.hasSuffix("." + domain)
        }
    }

    private func sendResponse(_ sock: Int32, status: Int, message: String) {
        let resp = "HTTP/1.1 \(status) \(message)\r\n\r\n"
        resp.withCString { ptr in
            _ = Darwin.send(sock, ptr, strlen(ptr), 0)
        }
    }

    // MARK: - Errors

    enum ProxyError: Error {
        case socketFailed(Int32)
        case bindFailed(Int32)
        case listenFailed(Int32)
    }
}

// MARK: - Data extension

private extension Data {
    var hasCRLFTerminator: Bool {
        count >= 4 && suffix(4) == Data([0x0D, 0x0A, 0x0D, 0x0A])
    }
}
