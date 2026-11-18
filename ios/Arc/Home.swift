import ConvexMobile
import SwiftUI

struct Home: View {
  @State var store = Store()

  var body: some View {
    ZStack {
      if let me = store.me {
        if me.workspaceId == nil { Start() } else { Workspace().id(me.workspaceId) }
      }
    }
    .live("workspace:me", $store.me)
    .live("workspace:workspaces", $store.places)
    .live("workspace:invitations", $store.invitations)
    .environment(store)
  }
}

struct Invitations: View {
  @Environment(Store.self) var store

  var body: some View {
    ForEach(store.invitations) { invitation in
      HStack {
        Text("\(invitation.from) invited you to \(invitation.workspace)")
          .frame(maxWidth: .infinity, alignment: .leading)
        Button("Decline") { run("workspace:decline", ["id": invitation._id]) }
        Button("Join") { run("workspace:accept", ["id": invitation._id]) }
          .buttonStyle(.borderedProminent)
      }
      .buttonStyle(.borderless)
    }
  }
}

struct Workspace: View {
  @Environment(Store.self) var store

  var body: some View {
    @Bindable var store = store
    TabView {
      Tab {
        Inbox()
      } label: {
        Image(systemName: "tray").accessibilityLabel("Inbox")
      }
      .badge(store.inbox.count { $0.inbox && $0.bucketId != nil && $0.unread })
      Tab {
        Boxes()
      } label: {
        Image(systemName: "archivebox").accessibilityLabel("Threads")
      }
      Tab(role: .prominent) {
        Settings()
      } label: {
        Image(systemName: "person.crop.circle").accessibilityLabel("Profile")
      }
    }
    .opacity(store.ready ? 1 : 0)
    .live("threads:inbox", $store.loaded.inbox)
    .live("workspace:buckets", $store.loaded.buckets)
    .live("workspace:people", $store.loaded.people)
    .live("workspace:groups", $store.teams)
    .live("workspace:pending", $store.pending)
    .live("files:mine", $store.files)
    .sheet(item: $store.composing) { NewMessage(draft: $0) }
    .sheet(isPresented: $store.searching) { Search() }
  }
}

struct Stack<Content: View>: View {
  @Environment(Store.self) var store
  @ViewBuilder var content: Content
  @State var path: [String] = []
  @State var shown = false

  var body: some View {
    NavigationStack(path: $path) {
      content
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .topBarLeading) { Switcher() }
          ToolbarItemGroup(placement: .topBarTrailing) {
            Button("Search", systemImage: "magnifyingglass") { store.searching = true }
            Button("New Message", systemImage: "square.and.pencil") { store.composing = Draft() }
          }
        }
        .tint(.primary)
        .navigationDestination(for: String.self) { ThreadView(threadId: $0) }
    }
    .onAppear { shown = true }
    .onDisappear { shown = false }
    .onChange(of: store.opened) {
      guard shown, let thread = store.opened else { return }
      var move = Transaction()
      move.disablesAnimations = store.searching
      withTransaction(move) { path = [thread] }
      store.opened = nil
    }
  }
}

struct Switcher: View {
  @Environment(Store.self) var store

  var body: some View {
    let name = Text(store.me?.workspace ?? "")
      .fontWeight(.semibold)
      .fixedSize()
      .frame(maxWidth: 200, alignment: .leading)
      .clipped()
    if store.places.count > 1 {
      Menu {
        Picker("Workspaces", selection: store.place) {
          ForEach(store.places) { Text($0.name).tag($0._id) }
        }
      } label: {
        HStack(spacing: 4) {
          name
          Image(systemName: "chevron.down")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
        }
      }
    } else {
      Button {
      } label: {
        name
      }
      .allowsHitTesting(false)
    }
  }
}

struct Strip: View {
  let items: [(id: String, name: String, count: Int?)]
  let open: String?
  @Binding var picked: String?
  @Namespace var pill

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: 4) {
        ForEach(items, id: \.id) { item in
          Button {
            withAnimation(.snappy(duration: 0.3)) { picked = item.id }
          } label: {
            HStack(spacing: 6) {
              Text(item.name).fontWeight(.semibold)
              if let count = item.count { Text("\(count)").opacity(0.6) }
            }
            .foregroundStyle(item.id == open ? .primary : .tertiary)
            .transaction { $0.animation = nil }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background {
              if item.id == open {
                Capsule()
                  .fill(.clear)
                  .glassEffect(.regular, in: .capsule)
                  .matchedGeometryEffect(id: "pill", in: pill)
              }
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 6)
    }
    .scrollIndicators(.hidden)
  }
}

struct Inbox: View {
  @Environment(Store.self) var store
  @State var picked: String?

  var body: some View {
    let inbox = store.inbox.filter { $0.inbox && $0.bucketId != nil }
    let open = store.buckets.first { $0._id == picked } ?? store.buckets.first
    Stack {
      Threads(rows: inbox.filter { $0.bucketId == open?._id }, empty: "All caught up")
        .transaction { $0.animation = nil }
        .safeAreaBar(edge: .top) {
          Strip(
            items: store.buckets.map { bucket in
              (bucket._id, bucket.name, inbox.count { $0.bucketId == bucket._id })
            }, open: open?._id, picked: $picked)
        }
    }
  }
}

struct Boxes: View {
  @Environment(Store.self) var store
  @State var picked: String? = "all"

  var body: some View {
    Stack {
      ZStack {
        if picked == "drafts" { Drafts() } else { Listed(sent: picked == "sent").id(picked) }
      }
      .transaction { $0.animation = nil }
      .safeAreaBar(edge: .top) {
        Strip(
          items: [
            ("all", "All Threads", nil), ("sent", "Sent", nil),
            ("drafts", "Drafts", store.drafts.isEmpty ? nil : store.drafts.count),
          ], open: picked, picked: $picked)
      }
    }
  }
}

struct Listed: View {
  let sent: Bool
  @State var rows = Paged<Row>()
  @State var size = 50.0

  var body: some View {
    Threads(rows: rows.page, empty: "Nothing here", more: rows.isDone ? nil : { size += 50 })
      .live("threads:list", $rows, with: ["sent": sent], page: size)
  }
}

struct Threads: View {
  @Environment(Store.self) var store
  let rows: [Row]
  let empty: String
  var more: (() -> Void)?

  var body: some View {
    let names = store.names
    List {
      ForEach(rows) { ThreadLink(row: $0, names: names) }
      if let more { ProgressView().frame(maxWidth: .infinity).row().onAppear(perform: more) }
    }
    .chrome()
    .nothing(empty, "tray", when: rows.isEmpty)
  }
}

struct ThreadLink: View {
  @Environment(Store.self) var store
  let row: Row
  let names: Names

  var body: some View {
    Button {
      store.opened = row.threadId
    } label: {
      VStack(alignment: .leading, spacing: 2) {
        HStack(spacing: 6) {
          Text(names.name(row.lastAuthorId))
            .fontWeight(row.unread ? .semibold : .regular)
            .clip()
          if row.unread { Circle().fill(.tint).frame(width: 8, height: 8) }
          Text(stamp(Date(timeIntervalSince1970: row.activeAt / 1000)))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        Text(row.title).font(.subheadline).clip()
        Text(names.plain(row.lastBody)).font(.subheadline).foregroundStyle(.secondary).clip()
      }
    }
    .foregroundStyle(.primary)
    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
    .row()
    .swipeActions(edge: .trailing) { Done(row: row).tint(.green) }
    .swipeActions(edge: .leading) { Unread(row: row).tint(.accent) }
    .contextMenu { ThreadActions(row: row) }
  }
}

struct Done: View {
  @Environment(Store.self) var store
  let row: Row

  var body: some View {
    Button(
      row.inbox ? "Done" : "Move to Buckets", systemImage: row.inbox ? "checkmark" : "tray"
    ) {
      store.change(row, "mark") { $0.inbox.toggle() }
    }
  }
}

struct Unread: View {
  @Environment(Store.self) var store
  let row: Row

  var body: some View {
    Button(
      row.unread ? "Mark Read" : "Mark Unread",
      systemImage: row.unread ? "envelope.open" : "envelope.badge"
    ) {
      store.change(row, "mark") { $0.unread.toggle() }
    }
  }
}

struct ThreadActions: View {
  @Environment(Store.self) var store
  let row: Row

  var body: some View {
    Done(row: row)
    Unread(row: row)
    Divider()
    ForEach(store.buckets.filter { $0._id != row.bucketId }) { bucket in
      Button("Move to \(bucket.name)", systemImage: "folder") {
        store.change(row, "move") { $0.bucketId = bucket._id }
      }
    }
  }
}

struct Drafts: View {
  @Environment(Store.self) var store

  var body: some View {
    List(store.drafts) { draft in
      Button {
        store.composing = draft
      } label: {
        HStack {
          Text(draft.text.trimmed.split(separator: "\n").first ?? "").clip()
          Text(stamp(draft.at)).font(.footnote).foregroundStyle(.secondary)
        }
      }
      .foregroundStyle(.primary)
      .row()
      .swipeActions {
        Button("Delete", systemImage: "trash", role: .destructive) {
          store.keep(draft, sent: true)
        }
      }
    }
    .chrome()
    .nothing("Nothing here", "doc", when: store.drafts.isEmpty)
  }
}

struct Search: View {
  @Environment(Store.self) var store
  @Environment(\.dismiss) var dismiss
  @State var query = ""
  @FocusState var typing: Bool
  @State var hits: [Message] = []
  @State var asked: [Row]?
  @State var busy = false

  var body: some View {
    let names = store.names
    let text = query.trimmed
    let titled = store.inbox.filter { text.isEmpty || $0.title.localizedStandardContains(text) }
    let threads = asked ?? titled
    VStack {
      List {
        ForEach(threads) { ThreadLink(row: $0, names: names) }
        ForEach(asked == nil ? hits : []) { hit in
          Button {
            store.opened = hit.threadId
          } label: {
            VStack(alignment: .leading, spacing: 2) {
              Text(names.plain(hit.body)).clip()
              Text(hit.title ?? "")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .clip()
            }
          }
                .foregroundStyle(.primary)
          .row()
        }
      }
      .chrome()
      .transaction { $0.animation = nil }
      .overlay {
        if busy { ProgressView() }
      }
      .nothing("No threads found", "magnifyingglass", when: !busy && threads.isEmpty && hits.isEmpty)
      .safeAreaBar(edge: .top) {
        HStack {
          Label {
            TextField("Search", text: $query).focused($typing)
          } icon: {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
          }
          .padding(.horizontal, 14)
          .padding(.vertical, 11)
          .glassEffect(.regular, in: .capsule)
          Button("Close", systemImage: "xmark") { dismiss() }
            .labelStyle(.iconOnly)
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
            .controlSize(.large)
        }
        .padding([.horizontal, .top])
        .padding(.bottom, 8)
      }
      .tint(.primary)
      .onAppear { typing = true }
      .onChange(of: store.opened) { dismiss() }
      .autocorrectionDisabled()
    }
    .task(id: text) {
      if !hits.isEmpty { hits = [] }
      if asked != nil { asked = nil }
      if busy { busy = false }
      guard text.count > 1, (try? await Task.sleep(for: .milliseconds(300))) != nil else { return }
      busy = titled.isEmpty
      async let near: [Message]? = try? convex.action("search:related", with: ["text": text])
      let worded: [Message] = await once("threads:search", ["text": text]) ?? []
      var seen = Set<String>()
      let found = (worded + (await near ?? [])).filter { seen.insert($0._id).inserted }
      if Task.isCancelled { return }
      hits = found
      if titled.isEmpty && found.isEmpty {
        let rows: [Row]? = try? await convex.action("search:ask", with: ["question": text])
        if Task.isCancelled { return }
        asked = rows ?? []
      }
      busy = false
    }
  }
}
