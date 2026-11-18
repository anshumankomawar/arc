import ConvexMobile
import PhotosUI
import SwiftUI

struct Attachment: Identifiable {
  let id = UUID()
  let name: String
  let data: Data
}

struct Composer: View {
  @Environment(Store.self) var store
  @Binding var text: String
  let placeholder: String
  var mustMention = false
  var form = false
  let send: (String, [ConvexEncodable?]) async throws -> Void
  @State var attached: [Attachment] = []
  @State var photos: [PhotosPickerItem] = []
  @State var pickingPhotos = false
  @State var pickingFiles = false
  @State var note = ""
  @State var busy = false
  @FocusState var typing: Bool

  var sendButton: some View {
    Button("Send", systemImage: "paperplane.fill") { Task { await submit() } }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.circle)
      .disabled(busy || (text.trimmed.isEmpty && attached.isEmpty))
  }

  var options: [String] {
    if let word = text.firstMatch(of: /@([^@\n]*)$/)?.1 {
      return matching(word, in: store.others.map(\.name) + store.teams.map(\.name), "@")
    }
    if let word = text.firstMatch(of: /(?:^|\s)\/(\S*)$/)?.1 {
      return matching(word, in: store.files.map(\.name), "/")
    }
    return []
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if form {
        TextField(placeholder, text: $text, axis: .vertical)
          .focused($typing)
          .frame(maxHeight: .infinity, alignment: .top)
      }
      if !note.isEmpty { Text(note).font(.footnote).foregroundStyle(.red) }
      chips(options) { option in
        text.replace(option.hasPrefix("@") ? /@[^@\n]*$/ : /\/\S*$/, with: option + " ")
      }
      chips(attached.map(\.name), icon: "xmark") { name in
        attached.removeAll { $0.name == name }
      }
      HStack(alignment: .bottom, spacing: 8) {
        Menu("Attach", systemImage: "plus") {
          Button("Photos", systemImage: "photo") { pickingPhotos = true }
          Button("Files", systemImage: "folder") { pickingFiles = true }
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .controlSize(.large)
        .tint(.primary)
        if form {
          Spacer()
          sendButton.controlSize(.large)
        } else {
          HStack(alignment: .bottom, spacing: 6) {
            TextField(placeholder, text: $text, axis: .vertical)
              .lineLimit(1...8)
              .padding(.vertical, 6)
            sendButton
          }
          .padding(.leading, 16)
          .padding([.trailing, .vertical], 6)
          .glassEffect(.regular, in: .rect(cornerRadius: 22))
        }
      }
      .labelStyle(.iconOnly)
    }
    .padding(form ? 16 : 12)
    .onAppear { typing = form }
    .photosPicker(isPresented: $pickingPhotos, selection: $photos)
    .onChange(of: photos) {
      Task {
        for photo in photos {
          let kind = photo.supportedContentTypes.first?.preferredFilenameExtension ?? "jpg"
          if let data = try? await photo.loadTransferable(type: Data.self) {
            attach("Photo \(attached.count + 1).\(kind)", data)
          }
        }
        photos = []
      }
    }
    .fileImporter(
      isPresented: $pickingFiles, allowedContentTypes: [.item], allowsMultipleSelection: true
    ) { picked in
      for url in (try? picked.get()) ?? [] where url.startAccessingSecurityScopedResource() {
        if let data = try? Data(contentsOf: url) { attach(url.lastPathComponent, data) }
        url.stopAccessingSecurityScopedResource()
      }
    }
  }

  func matching(_ word: Substring, in names: [String], _ prefix: String) -> [String] {
    names.filter { word.isEmpty || $0.localizedStandardContains(word) }.prefix(8).map {
      prefix + $0
    }
  }

  @ViewBuilder
  func chips(_ labels: [String], icon: String? = nil, pick: @escaping (String) -> Void)
    -> some View
  {
    if !labels.isEmpty {
      ScrollView(.horizontal) {
        HStack {
          ForEach(labels, id: \.self) { label in
            Button {
              pick(label)
            } label: {
              Text(label)
              if let icon { Image(systemName: icon) }
            }
            .buttonStyle(.bordered)
            .font(.subheadline)
          }
        }
      }
      .scrollIndicators(.hidden)
    }
  }

  func attach(_ name: String, _ data: Data) {
    if data.count > 15_000_000 {
      note = "Files can be up to 15 MB."
    } else {
      attached.append(Attachment(name: name, data: data))
    }
  }

  func submit() async {
    let body = store.encode(text.trimmed)
    if mustMention && !store.reaches(body) {
      note =
        body.contains("[[group:")
        ? "Nobody else is in that group yet. Add people to it in Settings."
        : "@mention someone to send this to."
      return
    }
    busy = true
    note = ""
    do {
      var files: [ConvexEncodable?] = []
      for file in attached { files.append(try await upload(file)) }
      try await send(body, files)
      text = ""
      attached = []
    } catch {
      note = "That didn’t send. Send again to retry."
    }
    busy = false
  }

  func put(_ data: Data) async throws -> String {
    let url: String = try await convex.mutation("files:uploadUrl")
    var request = URLRequest(url: URL(string: url)!)
    request.httpMethod = "POST"
    let (answer, _) = try await URLSession.shared.upload(for: request, from: data)
    return try JSONDecoder().decode([String: String].self, from: answer)["storageId"] ?? ""
  }

  func upload(_ file: Attachment) async throws -> [String: ConvexEncodable?] {
    var sent: [String: ConvexEncodable?] = [
      "storageId": try await put(file.data), "name": file.name,
    ]
    if let image = UIImage(data: file.data) {
      let scale = min(1, 720 / max(image.size.width, image.size.height))
      let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      if let small = image.preparingThumbnail(of: size)?.jpegData(compressionQuality: 0.85) {
        sent["thumb"] = [
          "storageId": try await put(small), "width": Double(image.size.width),
          "height": Double(image.size.height),
        ]
      }
    } else if file.name.contains(
      /\.(txt|md|csv|tsv|log|json|js|jsx|ts|tsx|html|css|py|go|rs|sh|yml|yaml|toml|xml|swift)$/
        .ignoresCase())
    {
      let lines = String(decoding: file.data.prefix(4000), as: UTF8.self).split(
        separator: "\n", omittingEmptySubsequences: false)
      sent["snippet"] = String(lines.prefix(12).joined(separator: "\n").prefix(1500))
    }
    return sent
  }
}

struct NewMessage: View {
  @Environment(Store.self) var store
  @Environment(\.dismiss) var dismiss
  @State var draft: Draft
  @State var sent = false

  var body: some View {
    NavigationStack {
      Composer(
        text: $draft.text, placeholder: "Write a message, @mention who it’s for",
        mustMention: true, form: true
      ) {
        store.opened = try await convex.mutation("threads:start", with: ["body": $0, "files": $1])
        sent = true
        dismiss()
      }
      .navigationTitle("New Message")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Close", systemImage: "xmark") { dismiss() }.tint(.primary)
        }
      }
    }
    .onDisappear { store.keep(draft, sent: sent) }
  }
}
