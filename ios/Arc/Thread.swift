import ConvexMobile
import QuickLook
import SwiftUI

struct ThreadView: View {
  @Environment(Store.self) var store
  @AppStorage("previews") var previews = true
  let threadId: String
  @State var paged = Paged<Message>()
  @State var size = 50.0
  @State var row: Row?
  @State var text = ""
  @State var shown: URL?

  var body: some View {
    let names = store.names
    let messages = paged.page
    let turns = messages.reversed().reduce(into: [[Message]]()) { turns, message in
      if turns.last?.first?.authorId == message.authorId {
        turns[turns.count - 1].append(message)
      } else {
        turns.append([message])
      }
    }
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 20) {
        if !paged.isDone { ProgressView().frame(maxWidth: .infinity).onAppear { size += 50 } }
        ForEach(turns, id: \.first) { turn in
          HStack(alignment: .top, spacing: 10) {
            Avatar(id: turn[0].authorId, size: 28)
            VStack(alignment: .leading, spacing: 6) {
              HStack {
                Text(names.name(turn[0].authorId)).fontWeight(.semibold)
                Text(ago(turn[0]._creationTime)).font(.footnote).foregroundStyle(.secondary)
              }
              ForEach(turn) { message in
                if !message.body.isEmpty { Text(names.rich(message.body)) }
                ForEach(message.files ?? []) { Sent(file: $0, shown: previews) }
                ForEach(previews ? message.links ?? [] : []) { Unfurled(link: $0) }
              }
            }
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding()
    }
    .defaultScrollAnchor(.bottom)
    .background(.chrome)
    .safeAreaBar(edge: .bottom) {
      Composer(text: $text, placeholder: "Reply") {
        try await convex.mutation(
          "threads:send", with: ["threadId": threadId, "body": $0, "files": $1])
      }
    }
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.hidden, for: .tabBar)
    .toolbar {
      if let row {
        ToolbarItem(placement: .principal) { Text(row.title).fontWeight(.semibold).clip() }
        ToolbarItem {
          Menu("Actions", systemImage: "ellipsis") { ThreadActions(row: row) }.tint(.primary)
        }
      }
    }
    .live("threads:messages", $paged, with: ["threadId": threadId], page: size)
    .live("threads:row", $row, with: ["threadId": threadId])
    .task(id: messages.count) {
      if let row, row.unread { store.change(row, "mark") { $0.unread = false } }
    }
    .environment(
      \.openURL,
      OpenURLAction { url in
        guard url.scheme == "arc", let id = url.host() else { return .systemAction }
        let name = messages.compactMap(\.files).joined().first { $0._id == id }?.name
        Task {
          guard let data = try? await download(id) else { return }
          let file = URL.temporaryDirectory.appending(path: name ?? names.name(id))
          try? data.write(to: file)
          shown = file
        }
        return .handled
      }
    )
    .quickLookPreview($shown)
  }
}

struct Shot: View {
  static let cache = NSCache<NSString, UIImage>()
  let id: String
  @State var image: UIImage?

  var body: some View {
    ZStack {
      if let image { Image(uiImage: image).resizable().scaledToFit() } else { Color.panel }
    }
    .clipShape(.rect(cornerRadius: 8))
    .task {
      image = Self.cache.object(forKey: id as NSString)
      guard image == nil, let loaded = try? await UIImage(data: download(id)) else { return }
      Self.cache.setObject(loaded, forKey: id as NSString)
      image = loaded
    }
  }
}

struct Sent: View {
  @Environment(\.openURL) var open
  let file: File
  let shown: Bool

  var body: some View {
    Button {
      open(URL(string: "arc://\(file._id)")!)
    } label: {
      VStack(alignment: .leading, spacing: 6) {
        if shown, let thumb = file.thumb {
          Shot(id: thumb.id)
            .aspectRatio(thumb.width / thumb.height, contentMode: .fit)
            .frame(maxWidth: 280, maxHeight: 240, alignment: .leading)
        } else if shown, let snippet = file.snippet {
          Text(snippet).font(.caption.monospaced()).lineLimit(12).multilineTextAlignment(.leading)
        }
        Label {
          Text(file.name)
          Text(Int64(file.size).formatted(.byteCount(style: .file))).foregroundStyle(.secondary)
        } icon: {
          Image(systemName: "doc")
        }
        .font(.subheadline)
      }
      .padding(8)
      .background(.panel, in: .rect(cornerRadius: 10))
    }
    .foregroundStyle(.primary)
    .contextMenu {
      Button("Copy Name", systemImage: "doc.on.doc") { UIPasteboard.general.string = file.name }
    }
  }
}

struct Unfurled: View {
  let link: Unfurl

  var body: some View {
    Link(destination: URL(string: link.url) ?? URL.temporaryDirectory) {
      VStack(alignment: .leading, spacing: 4) {
        Text(link.site).font(.caption).foregroundStyle(.secondary)
        Text(link.title).fontWeight(.semibold)
        Text(link.description).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
        if link.image { Shot(id: link._id).frame(maxHeight: 200) }
      }
      .multilineTextAlignment(.leading)
      .padding(10)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(.panel, in: .rect(cornerRadius: 10))
    }
    .foregroundStyle(.primary)
  }
}
