import ConvexMobile
import CoreText
import SwiftUI

@main
struct ArcApp: App {
  @AppStorage("theme") var theme = ""
  @State var signedIn: Bool?

  init() {
    for font in Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [] {
      CTFontManagerRegisterFontsForURL(font as CFURL, .process, nil)
    }
  }

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

struct SignOut: View {
  var body: some View {
    Button("Sign Out", role: .destructive) {
      UserDefaults.standard.removeObject(forKey: "drafts")
      Task { await convex.logout() }
    }
  }
}
