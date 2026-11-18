import Combine
import ConvexMobile
import SwiftUI

protocol Doc: Decodable, Identifiable, Hashable {
  var _id: String { get }
}
extension Doc {
  var id: String { _id }
}

struct Me: Decodable {
  let _id, name, email: String
  let workspaceId, workspace, role: String?
}
struct Person: Doc {
  let _id, name, email: String
  let role: String?
}
struct Place: Doc {
  let _id, name: String
  let people: Double
}
struct Invitation: Doc {
  let _id, workspace, from: String
}
struct Pending: Doc {
  let _id, email: String
}
struct Confirm {
  let title, message, label: String
  let run: () -> Void
}
struct Team: Doc {
  let _id, name: String
  let userIds: [String]
}
struct Bucket: Doc {
  let _id, name, description: String
}
struct File: Doc {
  struct Thumb: Decodable, Hashable {
    let id: String
    let width, height: Double
  }
  let _id, name: String
  let size: Double
  let thumb: Thumb?
  let snippet: String?
}
struct Unfurl: Doc {
  let _id, url, title, description, site: String
  let image: Bool
}
struct Message: Doc {
  let _id, threadId, authorId, body: String
  let _creationTime: Double
  let files: [File]?
  let links: [Unfurl]?
}
struct Row: Decodable, Identifiable {
  let threadId, title, lastAuthorId, lastBody: String
  let activeAt: Double
  let inbox, unread: Bool
  let sent: Bool?
  let bucketId: String?
  var id: String { threadId }
}
struct Draft: Codable, Identifiable {
  var id = UUID().uuidString
  var text = ""
  var at = Date.now
}

let token = /\[\[(person|group|file):(\w+)\]\]/
let piece = /\[\[(person|group|file):(\w+)\]\]|https?:\/\/[^\s<>"']+/

struct Names {
  let all: [String: String]

  func name(_ id: some StringProtocol) -> String { all[String(id)] ?? "someone" }

  func plain(_ body: String) -> String {
    body.replacing(token) { ($0.1 == "file" ? "" : "@") + name($0.2) }
  }

  func rich(_ body: String) -> AttributedString {
    var out = AttributedString()
    var at = body.startIndex
    for match in body.matches(of: piece) {
      out += AttributedString(body[at..<match.range.lowerBound])
      var part = AttributedString(body[match.range])
      if let kind = match.1, let id = match.2 {
        part = AttributedString((kind == "file" ? "" : "@") + name(id))
        part.foregroundColor = .accent
        if kind == "file" { part.link = URL(string: "arc://\(id)") }
      } else {
        part.link = URL(string: String(body[match.range]))
      }
      out += part
      at = match.range.upperBound
    }
    return out + AttributedString(body[at...])
  }
}

@Observable final class Store {
  var me: Me?
  var rows: [Row] = []
  var buckets: [Bucket] = []
  var people: [Person] = []
  var teams: [Team] = []
  var files: [File] = []
  var places: [Place] = []
  var invitations: [Invitation] = []
  var pending: [Pending] = []
  var composing: Draft?
  var opened: String?
  var searching = false
  var drafts =
    (try? JSONDecoder().decode(
      [Draft].self, from: UserDefaults.standard.data(forKey: "drafts") ?? Data())) ?? []

  var place: Binding<String> {
    Binding { self.me?.workspaceId ?? "" } set: { run("workspace:open", ["id": $0]) }
  }

  var others: [Person] { people.filter { $0._id != me?._id } }

  var names: Names {
    Names(
      all: Dictionary(
        people.map { ($0._id, $0.name) } + teams.map { ($0._id, $0.name) }
          + files.map { ($0._id, $0.name) }, uniquingKeysWith: { $1 }))
  }

  func keep(_ draft: Draft, sent: Bool = false) {
    drafts.removeAll { $0.id == draft.id }
    if !sent, !draft.text.trimmed.isEmpty {
      drafts.insert(Draft(id: draft.id, text: draft.text), at: 0)
    }
    UserDefaults.standard.set(try? JSONEncoder().encode(drafts), forKey: "drafts")
  }

  func encode(_ text: String) -> String {
    let tokens =
      others.map { ("@\($0.name)", "[[person:\($0._id)]]") }
      + teams.map { ("@\($0.name)", "[[group:\($0._id)]]") }
      + files.map { ("/\($0.name)", "[[file:\($0._id)]]") }
    return tokens.sorted { $0.0.count > $1.0.count }.reduce(text) {
      $0.replacingOccurrences(of: $1.0, with: $1.1)
    }
  }

  func reaches(_ body: String) -> Bool {
    body.matches(of: token).contains { match in
      match.1 == "person"
        ? match.2 != me?._id ?? ""
        : teams.first { $0._id == match.2 }?.userIds.contains { $0 != me?._id } == true
    }
  }
}

func run(_ name: String, _ args: [String: ConvexEncodable?]) {
  Task { try? await convex.mutation(name, with: args) }
}

func once<T: Decodable>(_ name: String, _ args: [String: ConvexEncodable?]) async -> T? {
  let values = convex.subscribe(to: name, with: args, yielding: T.self)
    .map(Optional.some).replaceError(with: nil).values
  for await value in values { return value }
  return nil
}

func download(_ id: String) async throws -> Data {
  struct Bytes: Decodable {
    enum Key: String, CodingKey { case bytes = "$bytes" }
    let data: Data
    init(from decoder: Decoder) throws {
      let encoded = try decoder.container(keyedBy: Key.self).decode(String.self, forKey: .bytes)
      data = Data(base64Encoded: encoded) ?? Data()
    }
  }
  let bytes: Bytes = try await convex.action("files:download", with: ["id": id])
  return bytes.data
}

func stamp(_ date: Date) -> String {
  if Calendar.current.isDateInToday(date) { return date.formatted(date: .omitted, time: .shortened) }
  if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
  return date.formatted(.dateTime.month(.abbreviated).day())
}

func ago(_ ms: Double) -> String {
  let minutes = Int((Date.now.timeIntervalSince1970 * 1000 - ms) / 60_000)
  if minutes < 1 { return "now" }
  if minutes < 60 { return "\(minutes)m ago" }
  if minutes < 60 * 24 { return "\(minutes / 60)h ago" }
  return "\(minutes / 60 / 24)d ago"
}

extension String {
  var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

extension Color {
  init(light: UInt32, dark: UInt32) {
    self.init(
      UIColor { traits in
        let hex = traits.userInterfaceStyle == .dark ? dark : light
        return UIColor(
          red: CGFloat(hex >> 16 & 255) / 255, green: CGFloat(hex >> 8 & 255) / 255,
          blue: CGFloat(hex & 255) / 255, alpha: 1)
      })
  }
}

extension ShapeStyle where Self == Color {
  static var chrome: Color { Color(light: 0xfafafa, dark: 0x101010) }
  static var panel: Color { Color(light: 0xffffff, dark: 0x171717) }
  static var accent: Color { Color(light: 0x007aff, dark: 0x0a84ff) }
}

extension View {
  func live<T: Decodable>(
    _ name: String, _ value: Binding<T>, with args: [String: ConvexEncodable?]? = nil
  ) -> some View {
    task {
      let updates = convex.subscribe(to: name, with: args, yielding: T.self)
        .catch { _ in Empty() }.values
      for await next in updates { value.wrappedValue = next }
    }
  }

  func clip() -> some View {
    lineLimit(1).fixedSize().frame(minWidth: 0, maxWidth: .infinity, alignment: .leading).clipped()
  }

  func row() -> some View {
    listRowBackground(Color.chrome).listSectionSeparator(.hidden, edges: .top)
  }

  func confirms(_ confirm: Binding<Confirm?>) -> some View {
    confirmationDialog(
      confirm.wrappedValue?.title ?? "",
      isPresented: Binding { confirm.wrappedValue != nil } set: { if !$0 { confirm.wrappedValue = nil } },
      titleVisibility: .visible, presenting: confirm.wrappedValue
    ) { asked in
      Button(asked.label, role: .destructive, action: asked.run)
    } message: { asked in
      Text(asked.message)
    }
  }

  func chrome() -> some View {
    listStyle(.plain).scrollContentBackground(.hidden).background(.chrome)
  }
}

struct Identicon: View {
  let seed: String
  var size = 22.0

  var body: some View {
    let hash = seed.utf16.reduce(UInt32(0x811c_9dc5)) { ($0 ^ UInt32($1)) &* 0x0100_0193 }
    let color = Color(hue: Double(hash % 360) / 360, saturation: 0.67, brightness: 0.78)
    Canvas { context, _ in
      let cell = size / 6
      for row in 0..<5 {
        for col in 0..<3 where hash >> UInt32(row * 3 + col + 9) & 1 == 1 {
          for x in Set([col, 4 - col]) {
            let square = CGRect(
              x: (Double(x) + 0.5) * cell, y: (Double(row) + 0.5) * cell, width: cell * 1.02,
              height: cell * 1.02)
            context.fill(Path(square), with: .color(color))
          }
        }
      }
    }
    .frame(width: size, height: size)
    .background(Color(white: 0.95))
    .clipShape(.circle)
  }
}
