import AuthenticationServices
import ConvexMobile
import Network
import SwiftUI

private let deployment = "https://uncommon-ibis-769.convex.cloud"
let site = "https://uncommon-ibis-769.convex.site"
private let open = ConvexClient(deploymentUrl: deployment)
let convex = ConvexClientWithAuth(deploymentUrl: deployment, authProvider: Session())

private struct Signed: Decodable {
  struct Tokens: Decodable { let accessToken, refreshToken: String }
  let tokens: Tokens?
}

private enum Keychain {
  static let item: [CFString: Any] = [
    kSecClass: kSecClassGenericPassword, kSecAttrAccount: "refreshToken",
  ]
  static var refreshToken: String? {
    get {
      var found: AnyObject?
      SecItemCopyMatching(item.merging([kSecReturnData: true]) { $1 } as CFDictionary, &found)
      return (found as? Data).map { String(decoding: $0, as: UTF8.self) }
    }
    set {
      SecItemDelete(item as CFDictionary)
      guard let newValue else { return }
      SecItemAdd(item.merging([kSecValueData: Data(newValue.utf8)]) { $1 } as CFDictionary, nil)
    }
  }
}

struct Session: AuthProvider {
  nonisolated(unsafe) static var token = ""

  func login(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
    try await loginFromCache(onIdToken: onIdToken)
  }

  func loginFromCache(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> String {
    guard let kept = Keychain.refreshToken else { throw CancellationError() }
    let signed: Signed = try await open.mutation(
      "auth:refreshSession", with: ["refreshToken": kept])
    Keychain.refreshToken = signed.tokens?.refreshToken
    guard let tokens = signed.tokens else { throw CancellationError() }
    Self.token = tokens.accessToken
    return tokens.accessToken
  }

  func logout() async throws {
    guard let kept = Keychain.refreshToken else { return }
    Keychain.refreshToken = nil
    try await open.mutation("auth:signOut", with: ["refreshToken": kept])
  }

  func extractIdToken(from token: String) -> String { token }
}

private func loopback() async throws -> String {
  let local = NWParameters.tcp
  local.requiredInterfaceType = .loopback
  local.allowLocalEndpointReuse = true
  let listener = try NWListener(using: local, on: 47201)
  defer { listener.cancel() }
  let codes = AsyncStream<String> { found in
    listener.newConnectionHandler = { connection in
      connection.start(queue: .main)
      connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, _, _ in
        let request = String(decoding: data ?? Data(), as: UTF8.self)
        connection.send(
          content: Data("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n".utf8),
          completion: .contentProcessed { _ in connection.cancel() })
        if let code = request.firstMatch(of: /convexAuthCode=([^&\s]+)/)?.1 {
          found.yield(code.removingPercentEncoding ?? String(code))
        } else if request.contains("convexAuthError") {
          found.finish()
        }
      }
    }
    listener.start(queue: .main)
  }
  for await code in codes { return code }
  throw CancellationError()
}

func google(_ web: WebAuthenticationSession) async throws {
  struct Started: Decodable { let redirect, state: String }
  let started: Started = try await open.mutation(
    "auth:startSignInWithGoogle", with: ["redirectTo": "http://127.0.0.1:47201/"])
  let code = try await withThrowingTaskGroup(of: String.self) { group in
    group.addTask { try await loopback() }
    group.addTask {
      _ = try await web.authenticate(
        using: URL(string: started.redirect)!, callbackURLScheme: "arc")
      throw CancellationError()
    }
    defer { group.cancelAll() }
    return try await group.next()!
  }
  let signed: Signed = try await open.mutation(
    "auth:completeSignInWithGoogle", with: ["code": code, "state": started.state])
  Keychain.refreshToken = signed.tokens?.refreshToken
  _ = try await convex.login().get()
}
