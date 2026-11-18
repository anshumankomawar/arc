import AuthenticationServices
import ConvexMobile
import SwiftUI

struct Welcome<Content: View>: View {
  let title: String
  @ViewBuilder var content: Content

  var body: some View {
    VStack(spacing: 0) {
      Text(title)
        .font(.face("Fraunces", 36, 300))
        .tracking(-0.72)
        .arrive(0.08)
      content
    }
    .font(.face("Hanken Grotesk", 14, 400))
    .foregroundStyle(.ink)
    .multilineTextAlignment(.center)
    .frame(maxWidth: 360)
    .padding(.horizontal, 40)
    .padding(.bottom, 80)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(.chrome)
  }
}

struct Pill: ButtonStyle {
  @Environment(\.isEnabled) var enabled
  var wide = true

  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 10) { configuration.label }
      .font(.face("Hanken Grotesk", 14, 500))
      .foregroundStyle(.chrome)
      .padding(.horizontal, 22)
      .frame(maxWidth: wide ? .infinity : nil, minHeight: 42)
      .background(.ink, in: .capsule)
      .opacity(enabled ? 1 : 0.8)
      .scaleEffect(configuration.isPressed ? 0.985 : 1)
      .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
  }
}

struct Quiet: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.font(.face("Hanken Grotesk", 13, 400)).foregroundStyle(.faint)
  }
}

extension Font {
  static func face(_ family: String, _ size: Double, _ weight: Double) -> Font {
    let variation = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
    let face = UIFontDescriptor(fontAttributes: [.family: family, variation: [2_003_265_652: weight]])
    return Font(UIFont(descriptor: face, size: size))
  }
}

extension View {
  func arrive(_ delay: Double) -> some View { modifier(Arrive(delay: delay)) }

  func hint() -> some View { foregroundStyle(.faint).padding(.top, 10) }

  func alert() -> some View {
    font(.face("Hanken Grotesk", 13, 400))
      .foregroundStyle(Color(light: 0xc62828, dark: 0xff8a80))
      .padding(.top, 10)
  }
}

struct Arrive: ViewModifier {
  let delay: Double
  @State var here = false

  func body(content: Content) -> some View {
    content
      .opacity(here ? 1 : 0)
      .offset(y: here ? 0 : 12)
      .onAppear {
        withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.6).delay(delay)) { here = true }
      }
  }
}

struct SignIn: View {
  @Environment(\.webAuthenticationSession) var web
  @State var busy = false
  @State var failed = false

  var body: some View {
    Welcome(title: "Where decisions\ndon’t get lost") {
      Text("Arc is team messaging in threads that sort themselves.").hint().arrive(0.3)
      Button {
        Task {
          busy = true
          failed = (try? await google(web)) == nil
          busy = false
        }
      } label: {
        if busy { ProgressView().tint(.chrome) } else { Image("google").resizable().frame(width: 18, height: 18) }
        Text("Continue with Google")
      }
      .buttonStyle(Pill(wide: false))
      .disabled(busy)
      .padding(.top, 26)
      .arrive(0.42)
      if failed { Text("Signing in with Google didn’t finish.").alert() }
    }
  }
}

struct Start: View {
  @Environment(Store.self) var store

  var body: some View {
    Welcome(title: "Welcome to Arc") {
      ForEach(store.invitations) { invitation in
        Text("\(invitation.from) invited you to \(invitation.workspace).").hint().padding(.top, 12)
        Button("Join \(invitation.workspace)") {
          run("workspace:accept", ["id": invitation._id])
        }
        .buttonStyle(Pill())
        .padding(.top, 12)
        Button("Decline") { run("workspace:decline", ["id": invitation._id]) }
          .buttonStyle(Quiet())
          .padding(.top, 12)
      }
      Choice()
      SignOut().buttonStyle(Quiet()).padding(.top, 26)
    }
  }
}

struct Choice: View {
  var done = {}
  @Namespace var indicator
  @State var joining = false
  @State var text = ""
  @State var failed = false

  var body: some View {
    Text(joining ? "Paste the invite link a teammate sent you." : "Start a workspace for your team.")
      .hint()
      .arrive(0.3)
    HStack(spacing: 0) {
      ForEach([false, true], id: \.self) { mode in
        Button(mode ? "Join" : "Start") {
          withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.32)) { joining = mode }
          failed = false
        }
        .font(.face("Hanken Grotesk", 14, 500))
        .foregroundStyle(joining == mode ? .ink : .faint)
        .frame(maxWidth: .infinity, minHeight: 30)
        .background {
          if joining == mode {
            Capsule()
              .fill(Color(light: 0xffffff, dark: 0x343434))
              .shadow(color: .black.opacity(0.1), radius: 1.5, y: 1)
              .matchedGeometryEffect(id: "indicator", in: indicator)
          }
        }
      }
    }
    .buttonStyle(.plain)
    .padding(3)
    .background(.ink.opacity(0.05), in: .capsule)
    .padding(.top, 26)
    .arrive(0.36)
    TextField(joining ? "Invite link" : "Workspace name", text: $text)
      .textInputAutocapitalization(joining ? .never : .words)
      .autocorrectionDisabled()
      .padding(.horizontal, 18)
      .frame(height: 42)
      .background(.ink.opacity(0.05), in: .capsule)
      .overlay { Capsule().strokeBorder(.ink.opacity(0.1), lineWidth: 0.5) }
      .padding(.top, 12)
    Button(joining ? "Join Workspace" : "Create Workspace") {
      Task {
        if joining {
          let joined: Bool? = try? await convex.mutation("workspace:join", with: ["link": text])
          failed = joined != true
        } else {
          try? await convex.mutation("workspace:create", with: ["name": text.trimmed])
        }
        if !failed { done() }
      }
    }
    .buttonStyle(Pill())
    .disabled(text.trimmed.isEmpty)
    .padding(.top, 10)
    .arrive(0.42)
    if failed { Text("That link doesn’t lead to a workspace.").alert() }
  }
}
