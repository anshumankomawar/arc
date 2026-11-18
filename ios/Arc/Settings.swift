import ConvexMobile
import SwiftUI

struct Settings: View {
  @Environment(Store.self) var store
  @AppStorage("theme") var theme = ""
  @AppStorage("previews") var previews = true
  @State var adding = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Invitations()
          if store.places.count > 1 {
            Picker("Workspaces", selection: store.place) {
              ForEach(store.places) { Text($0.name).tag($0._id) }
            }
            .pickerStyle(.inline)
            .labelsHidden()
          } else {
            Text(store.me?.workspace ?? "")
          }
          Button("Create or Join a Workspace") { adding = true }
        } header: {
          Text("Workspaces")
        } footer: {
          Text("Your workspaces. Open one to switch to it.")
        }

        Current()

        Section("Account") {
          LabeledContent(store.me?.name ?? "", value: store.me?.email ?? "")
          SignOut()
        }

        Section("Appearance") {
          Picker("Theme", selection: $theme) {
            Text("System").tag("")
            Text("Light").tag("light")
            Text("Dark").tag("dark")
          }
          Toggle("Previews of images and links", isOn: $previews)
        }

        Section {
          ForEach(store.buckets) { bucket in
            NavigationLink(bucket.name) {
              BucketEditor(id: bucket._id, name: bucket.name, description: bucket.description)
            }
          }
          NavigationLink("Add a bucket") { BucketEditor() }
        } header: {
          Text("Buckets")
        } footer: {
          Text("A new thread goes to the bucket whose description fits it best.")
        }

        Section {
          ForEach(store.teams) { team in
            NavigationLink(team.name) {
              TeamEditor(id: team._id, name: team.name, members: Set(team.userIds))
            }
          }
          NavigationLink("Add a group") { TeamEditor() }
        } header: {
          Text("Groups")
        } footer: {
          Text("Mention a group to bring everyone in it into a thread.")
        }
      }
    }
    .sheet(isPresented: $adding) {
      Welcome(title: "Add a workspace") { Choice { adding = false } }
    }
  }
}

struct Current: View {
  @Environment(Store.self) var store
  @State var name = ""
  @State var emails = ""
  @State var copied = false
  @State var confirm: Confirm?

  var body: some View {
    let owner = store.me?.role == "owner"
    let workspace = store.me?.workspace ?? ""
    Section(workspace) {
      if owner {
        TextField("Workspace name", text: $name)
          .onSubmit { run("workspace:rename", ["name": name]) }
          .task(id: workspace) { name = workspace }
      }
      HStack {
        TextField("name@company.com", text: $emails)
          .textInputAutocapitalization(.never)
          .keyboardType(.emailAddress)
        Button("Invite") {
          let listed = emails.split { " ,;\n".contains($0) }.map { String($0) as ConvexEncodable? }
          run("workspace:invite", ["emails": listed])
          emails = ""
        }
        .disabled(emails.trimmed.isEmpty)
      }
      ForEach(store.people) { person in
        LabeledContent {
          Text(person.role == "owner" ? "Owner" : person.email)
        } label: {
          Label {
            Text(person.name)
          } icon: {
            Avatar(id: person._id)
          }
        }
        .swipeActions {
          if owner && person._id != store.me?._id {
            Button("Remove") {
              confirm = Confirm(
                title: "Remove \(person.name)?",
                message: "They leave \(workspace) and its threads.", label: "Remove"
              ) { run("workspace:removePerson", ["userId": person._id]) }
            }
            .tint(.red)
          }
        }
      }
      ForEach(store.pending) { invitation in
        LabeledContent(invitation.email, value: "Invited")
          .swipeActions {
            Button("Revoke") { run("workspace:revoke", ["id": invitation._id]) }.tint(.red)
          }
      }
      Button(copied ? "Copied" : "Copy Invite Link") { link("inviteLink") }
      if owner { Button("Reset Invite Link") { link("resetLink") } }
      Button("Leave Workspace", role: .destructive) {
        confirm = Confirm(
          title: "Leave \(workspace)?", message: "You can come back with an invite.",
          label: "Leave"
        ) { run("workspace:leave", ["id": store.me?.workspaceId]) }
      }
      if owner {
        Button("Delete Workspace", role: .destructive) {
          confirm = Confirm(
            title: "Delete \(workspace)?",
            message: "Its threads, messages and files are deleted for everyone.", label: "Delete"
          ) { run("workspace:removeWorkspace", [:]) }
        }
      }
    }
    .confirms($confirm)
  }

  func link(_ name: String) {
    Task {
      let link: String? = try? await convex.mutation("workspace:\(name)")
      UIPasteboard.general.string = link
      copied = link != nil
    }
  }
}

struct Editor<Fields: View>: View {
  @Environment(\.dismiss) var dismiss
  let kind: String
  var id: String?
  @Binding var name: String
  var warning: String?
  let save: [String: ConvexEncodable?]
  @ViewBuilder var fields: Fields
  @State var confirm: Confirm?

  var body: some View {
    Form {
      TextField("Name", text: $name)
      fields
      if id != nil {
        Button("Delete", role: .destructive) {
          guard let warning else { return remove() }
          confirm = Confirm(
            title: "Delete \(name)?", message: warning, label: "Delete", run: remove)
        }
      }
    }
    .navigationTitle(id == nil ? "New \(kind)" : name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      Button("Save") {
        run(
          "workspace:save\(kind)",
          save.merging(["id": id, "name": name.trimmed]) { $1 }.filter { $1 != nil })
        dismiss()
      }
      .disabled(name.trimmed.isEmpty)
    }
    .confirms($confirm)
  }

  func remove() {
    run("workspace:remove\(kind)", ["id": id])
    dismiss()
  }
}

struct BucketEditor: View {
  var id: String?
  @State var name = ""
  @State var description = ""

  var body: some View {
    Editor(
      kind: "Bucket", id: id, name: $name, warning: "Its threads stay in All Threads.",
      save: ["description": description.trimmed]
    ) {
      TextField("What belongs in it", text: $description, axis: .vertical)
    }
  }
}

struct TeamEditor: View {
  @Environment(Store.self) var store
  var id: String?
  @State var name = ""
  @State var members: Set<String> = []

  var body: some View {
    Editor(
      kind: "Group", id: id, name: $name,
      save: ["userIds": members.map { $0 as ConvexEncodable? }]
    ) {
      Section("People") {
        ForEach(store.people.filter { members.contains($0._id) }) { person in
          Text(person.name)
            .swipeActions {
              Button("Remove") { members.remove(person._id) }.tint(.red)
            }
        }
        Menu("Add people") {
          ForEach(store.people.filter { !members.contains($0._id) }) { person in
            Button(person.name) { members.insert(person._id) }
          }
        }
      }
    }
  }
}
