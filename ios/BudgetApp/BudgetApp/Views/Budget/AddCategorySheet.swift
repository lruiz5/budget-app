import SwiftUI

struct AddCategorySheet: View {
    let onSave: (String, String) async -> Void // (name, emoji)

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var selectedEmoji = "📋"
    @State private var isSaving = false
    @State private var isEmojiPickerExpanded = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Category Name", text: $name)
                        .autocapitalization(.words)
                }

                Section {
                    DisclosureGroup(isExpanded: $isEmojiPickerExpanded) {
                        emojiGrid
                    } label: {
                        HStack {
                            Text("Emoji")
                            Spacer()
                            Text(selectedEmoji)
                                .font(.outfitTitle2)
                        }
                    }
                }

                Section {
                    Text("Custom categories appear between default categories and Saving.")
                        .font(.outfitCaption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Category")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        save()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
    }

    // MARK: - Emoji Grid

    private var emojiGrid: some View {
        ForEach(Self.emojiGroups, id: \.label) { group in
            VStack(alignment: .leading, spacing: 4) {
                Text(group.label)
                    .font(.outfitCaption)
                    .foregroundStyle(.secondary)

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 6) {
                    ForEach(group.emojis, id: \.self) { emoji in
                        Button {
                            selectedEmoji = emoji
                        } label: {
                            Text(emoji)
                                .font(.outfitTitle3)
                                .frame(width: 36, height: 36)
                                .background(
                                    selectedEmoji == emoji
                                        ? Color.blue.opacity(0.2)
                                        : Color.clear
                                )
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                                .overlay(
                                    selectedEmoji == emoji
                                        ? RoundedRectangle(cornerRadius: 6)
                                            .stroke(Color.blue, lineWidth: 2)
                                        : nil
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Save

    private func save() {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        guard !trimmedName.isEmpty else { return }

        isSaving = true
        Task {
            await onSave(trimmedName, selectedEmoji)
            await MainActor.run {
                dismiss()
            }
        }
    }

    // MARK: - Emoji Data

    private struct EmojiGroup {
        let label: String
        let emojis: [String]
    }

    private static let emojiGroups: [EmojiGroup] = [
        EmojiGroup(label: "Finance", emojis: ["💰", "💵", "💳", "🏦", "💎", "🪙", "📈", "📉", "💸", "🧾", "🏧"]),
        EmojiGroup(label: "Home", emojis: ["🏠", "🏡", "🛋️", "🛏️", "🧹", "🔑", "🪴", "🕯️", "🧺", "🪣", "🧽"]),
        EmojiGroup(label: "Transport", emojis: ["🚗", "🚕", "🚌", "🚇", "✈️", "⛽", "🚲", "🛵", "🚂", "🛞", "🅿️"]),
        EmojiGroup(label: "Food & Drink", emojis: ["🍽️", "🍕", "🍔", "🥗", "☕", "🍺", "🛒", "🥡", "🧁", "🍳", "🥤"]),
        EmojiGroup(label: "Health", emojis: ["💊", "🏥", "🩺", "🧘", "💪", "🏃", "🦷", "👁️", "🧠", "❤️", "🩹"]),
        EmojiGroup(label: "Education", emojis: ["📚", "🎓", "✏️", "💻", "📝", "🔬", "🎨", "📐", "🧪", "📖", "🏫"]),
        EmojiGroup(label: "Kids & Pets", emojis: ["👶", "🧸", "🎮", "🐕", "🐈", "🎪", "🧩", "🎠", "🐾", "🍼", "🎒"]),
        EmojiGroup(label: "Fun & Hobbies", emojis: ["🎬", "🎵", "🎮", "🎯", "🎸", "📸", "🎿", "⚽", "🎭", "🎲", "🏕️"]),
        EmojiGroup(label: "Giving", emojis: ["🤲", "🎁", "❤️", "🙏", "🤝", "💝", "🕊️", "🌍", "⛪", "🎗️", "💐"]),
        EmojiGroup(label: "Travel", emojis: ["✈️", "🏖️", "🗺️", "🧳", "🏔️", "🌴", "🚢", "🏰", "🎡", "⛺", "🌅"]),
        EmojiGroup(label: "Work", emojis: ["💼", "🏢", "📊", "📋", "🖥️", "📱", "📞", "🔧", "⚙️", "🔨", "🪪"]),
        EmojiGroup(label: "Nature", emojis: ["🌿", "🌸", "🌊", "🌻", "🍃", "🌙", "☀️", "🌈", "🦋", "🐝", "🌲"]),
    ]
}

#Preview {
    AddCategorySheet(onSave: { _, _ in })
}
