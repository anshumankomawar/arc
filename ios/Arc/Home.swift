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

struct Start: View {
  var body: some View {
    Welcome(title: "Welcome to Arc") {
      Invitations()
      Choice()
      SignOut()
    }
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

struct Choice: View {
  var done = {}
  @State var joining = false
  @State var text = ""
  @State var failed = false

  var body: some View {
    Text(joining ? "Paste the invite link a teammate sent you." : "Start a workspace for your team.")
      .foregroundStyle(.secondary)
    Picker("Start or join", selection: $joining) {
      Text("Start").tag(false)
      Text("Join").tag(true)
    }
    .pickerStyle(.segmented)
    TextField(joining ? "Invite link" : "Workspace name", text: $text)
      .textFieldStyle(.roundedBorder)
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
    .buttonStyle(.borderedProminent)
    .disabled(text.trimmed.isEmpty)
    if failed { Text("That link doesn’t lead to a workspace.").foregroundStyle(.red) }
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
      .badge(store.rows.count { $0.inbox && $0.bucketId != nil && $0.unread })
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
    .live("threads:list", $store.rows)
    .live("workspace:buckets", $store.buckets)
    .live("workspace:people", $store.people)
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
    Menu {
      Picker("Workspaces", selection: store.place) {
        ForEach(store.places) { Text($0.name).tag($0._id) }
      }
    } label: {
      HStack(spacing: 4) {
        Text(store.me?.workspace ?? "")
          .fontWeight(.semibold)
          .fixedSize()
          .frame(maxWidth: 200, alignment: .leading)
          .clipped()
        Image(systemName: "chevron.down").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
      }
    }
  }
}

struct Strip: View {
  let items: [(id: String, name: String, count: Int?)]
  let open: String?
  @Binding var picked: String?

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: 20) {
        ForEach(items, id: \.id) { item in
          Button {
            picked = item.id
          } label: {
            Text(item.name).fontWeight(.semibold)
            if let count = item.count { Text("\(count)").opacity(0.6) }
          }
          .foregroundStyle(item.id == open ? .primary : .tertiary)
        }
      }
      .padding(.horizontal)
      .padding(.vertical, 8)
    }
    .scrollIndicators(.hidden)
  }
}

struct Inbox: View {
  @Environment(Store.self) var store
  @State var picked: String?

  var body: some View {
    let inbox = store.rows.filter { $0.inbox && $0.bucketId != nil }
    let open = store.buckets.first { $0._id == picked } ?? store.buckets.first
    Stack {
      Threads(rows: inbox.filter { $0.bucketId == open?._id }, empty: "All caught up")
        .id(open?._id)
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
        if picked == "drafts" {
          Drafts()
        } else {
          Threads(
            rows: store.rows.filter { picked == "all" || $0.sent == true }, empty: "Nothing here")
        }
      }
      .id(picked)
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

struct Threads: View {
  @Environment(Store.self) var store
  let rows: [Row]
  let empty: String

  var body: some View {
    let names = store.names
    List(rows) { ThreadLink(row: $0, names: names) }
      .chrome()
      .overlay {
        if rows.isEmpty { ContentUnavailableView(empty, systemImage: "tray") }
      }
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
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Circle().fill(.tint).frame(width: 8, height: 8).opacity(row.unread ? 1 : 0)
        VStack(alignment: .leading, spacing: 2) {
          HStack {
            Text(names.name(row.lastAuthorId))
              .fontWeight(row.unread ? .semibold : .regular)
              .clip()
            Text(stamp(Date(timeIntervalSince1970: row.activeAt / 1000)))
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
          Text(row.title).font(.subheadline).clip()
          Text(names.plain(row.lastBody)).font(.subheadline).foregroundStyle(.secondary).clip()
        }
      }
    }
    .foregroundStyle(.primary)
    .listRowInsets(EdgeInsets(top: 10, leading: 4, bottom: 10, trailing: 16))
    .row()
    .swipeActions(edge: .trailing) { Done(row: row).tint(.green) }
    .swipeActions(edge: .leading) { Unread(row: row).tint(.accent) }
    .contextMenu { ThreadActions(row: row) }
  }
}

struct Done: View {
  let row: Row

  var body: some View {
    Button(
      row.inbox ? "Done" : "Move to Buckets", systemImage: row.inbox ? "checkmark" : "tray"
    ) {
      run("threads:mark", ["threadId": row.threadId, "inbox": !row.inbox])
    }
  }
}

struct Unread: View {
  let row: Row

  var body: some View {
    Button(
      row.unread ? "Mark Read" : "Mark Unread",
      systemImage: row.unread ? "envelope.open" : "envelope.badge"
    ) {
      run("threads:mark", ["threadId": row.threadId, "unread": !row.unread])
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
        run("threads:move", ["threadId": row.threadId, "bucketId": bucket._id])
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
    .overlay {
      if store.drafts.isEmpty { ContentUnavailableView("Nothing here", systemImage: "doc") }
    }
  }
}

struct Search: View {
  @Environment(Store.self) var store
  @Environment(\.dismiss) var dismiss
  @State var query = ""
  @State var searching = true
  @State var hits: [Message] = []
  @State var asked: [String]?
  @State var busy = false

  var body: some View {
    let names = store.names
    let text = query.trimmed
    let titled = store.rows.filter { text.isEmpty || $0.title.localizedStandardContains(text) }
    let threads = asked?.compactMap { id in store.rows.first { $0.threadId == id } } ?? titled
    NavigationStack {
      List {
        ForEach(threads) { ThreadLink(row: $0, names: names) }
        ForEach(asked == nil ? hits : []) { hit in
          Button {
            store.opened = hit.threadId
          } label: {
            VStack(alignment: .leading, spacing: 2) {
              Text(names.plain(hit.body)).clip()
              Text(store.rows.first { $0.threadId == hit.threadId }?.title ?? "")
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
      .overlay {
        if busy {
          ProgressView()
        } else if threads.isEmpty && hits.isEmpty {
          ContentUnavailableView("No threads found", systemImage: "magnifyingglass")
        }
      }
      .searchable(
        text: $query, isPresented: $searching,
        placement: .navigationBarDrawer(displayMode: .always)
      )
      .searchPresentationToolbarBehavior(.avoidHidingContent)
      .navigationTitle("Search")
      .navigationBarTitleDisplayMode(.inline)
      .tint(.primary)
      .onChange(of: searching) { dismiss() }
      .onChange(of: store.opened) { dismiss() }
      .autocorrectionDisabled()
    }
    .task(id: text) {
      (hits, asked, busy) = ([], nil, false)
      guard text.count > 1, (try? await Task.sleep(for: .milliseconds(300))) != nil else { return }
      busy = titled.isEmpty
      async let near: [Message]? = try? convex.action("search:related", with: ["text": text])
      let worded: [Message] = await once("threads:search", ["text": text]) ?? []
      var seen = Set<String>()
      let found = (worded + (await near ?? [])).filter { seen.insert($0._id).inserted }
      if Task.isCancelled { return }
      hits = found
      if titled.isEmpty && found.isEmpty {
        let ids: [String]? = try? await convex.action("search:ask", with: ["question": text])
        if Task.isCancelled { return }
        asked = ids ?? []
      }
      busy = false
    }
  }
}
