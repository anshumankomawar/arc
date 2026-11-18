import AuthenticationServices
import ConvexMobile
import SwiftUI

@main
struct ArcApp: App {
  @AppStorage("theme") var theme = ""
  @State var signedIn: Bool?

  var body: some Scene {
    WindowGroup {
      ZStack {
        Color.chrome.ignoresSafeArea()
        if signedIn == true { Home() } else if signedIn == false { SignIn() }
      }
      .tint(.accent)
      .preferredColorScheme(theme == "dark" ? .dark : theme == "light" ? .light : nil)
      .task {
        _ = await convex.loginFromCache()
        for await state in convex.authState.values {
          if case .authenticated = state { signedIn = true }
          if case .unauthenticated = state { signedIn = false }
        }
      }
    }
  }
}

struct Welcome<Content: View>: View {
  let title: String
  var hint = ""
  @ViewBuilder var content: Content

  var body: some View {
    VStack(spacing: 16) {
      Text(title).font(.largeTitle.weight(.light))
      if !hint.isEmpty { Text(hint).foregroundStyle(.secondary) }
      content
    }
    .multilineTextAlignment(.center)
    .padding(32)
  }
}

struct SignIn: View {
  @Environment(\.webAuthenticationSession) var web
  @State var busy = false
  @State var failed = false

  var body: some View {
    Welcome(
      title: "Where decisions don’t get lost",
      hint: "Arc is team messaging in threads that sort themselves."
    ) {
      Button("Continue with Google") {
        Task {
          busy = true
          failed = (try? await google(web)) == nil
          busy = false
        }
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .disabled(busy)
      if failed { Text("Signing in with Google didn’t finish.").foregroundStyle(.red) }
    }
  }
}

struct SignOut: View {
  var body: some View {
    Button("Sign Out", role: .destructive) {
      UserDefaults.standard.removeObject(forKey: "drafts")
      Task { await convex.logout() }
    }
  }
}
