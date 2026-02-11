import SwiftUI

struct OnboardingItemsStep: View {
    @ObservedObject var viewModel: OnboardingViewModel

    // Per-category input state
    @State private var itemName: String = ""
    @State private var itemPlanned: String = ""

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 16) {
                    Text("Create Budget Items")
                        .font(.title2)
                        .fontWeight(.bold)
                        .padding(.top, 24)

                    Text("Practice adding line items for your spending. Tap a suggestion to auto-fill, or type your own.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)

                    // Summary banner
                    if !viewModel.createdItems.isEmpty {
                        HStack {
                            Label("\(viewModel.createdItems.count) items", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Spacer()
                            Text("Total: \(viewModel.totalPlanned.formatted())")
                                .fontWeight(.semibold)
                        }
                        .font(.subheadline)
                        .padding(12)
                        .background(Color.green.opacity(0.1))
                        .cornerRadius(10)
                        .padding(.horizontal, 20)
                    }

                    // Category accordions
                    VStack(spacing: 8) {
                        ForEach(viewModel.expenseCategories, id: \.type) { entry in
                            categoryAccordion(type: entry.type, displayName: entry.displayName)
                        }
                    }
                    .padding(.horizontal, 20)

                    if let error = viewModel.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal, 24)
                    }
                }
                .padding(.bottom, 24)
            }
            .onTapGesture { hideKeyboard() }

            // Navigation buttons
            HStack(spacing: 12) {
                Button {
                    viewModel.previousStep()
                } label: {
                    Text("Back")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray5))
                        .foregroundStyle(.primary)
                        .fontWeight(.medium)
                        .cornerRadius(12)
                }

                Button {
                    Task {
                        if await viewModel.saveItemsStep() {
                            viewModel.nextStep()
                        }
                    }
                } label: {
                    Text("Continue")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(viewModel.createdItems.isEmpty ? Color(.systemGray4) : Color.green)
                        .foregroundStyle(.white)
                        .fontWeight(.semibold)
                        .cornerRadius(12)
                }
                .disabled(viewModel.createdItems.isEmpty)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
    }

    // MARK: - Category Accordion

    @ViewBuilder
    private func categoryAccordion(type: String, displayName: String) -> some View {
        let isExpanded = viewModel.expandedCategoryType == type
        let categoryItems = viewModel.items(for: type)
        let suggestions = viewModel.remainingSuggestions(for: type)

        VStack(spacing: 0) {
            // Header
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    viewModel.expandedCategoryType = isExpanded ? nil : type
                    // Reset input fields when switching
                    itemName = ""
                    itemPlanned = ""
                }
            } label: {
                HStack {
                    Text(displayName)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)

                    if !categoryItems.isEmpty {
                        Text("\(categoryItems.count)")
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green)
                            .cornerRadius(8)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .padding(12)
            }

            if isExpanded {
                VStack(spacing: 10) {
                    // Existing items
                    ForEach(categoryItems) { item in
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                                .font(.caption)
                            Text(item.name)
                                .font(.caption)
                            Spacer()
                            Text(item.planned.formatted())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 12)
                    }

                    // Suggestion chips
                    if !suggestions.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(suggestions, id: \.name) { suggestion in
                                    Button {
                                        itemName = suggestion.name
                                        itemPlanned = String(describing: suggestion.planned)
                                    } label: {
                                        Text("\(suggestion.name) \(suggestion.planned.formatted())")
                                            .font(.caption)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(Color.green.opacity(0.12))
                                            .foregroundStyle(.green)
                                            .cornerRadius(16)
                                    }
                                }
                            }
                            .padding(.horizontal, 12)
                        }
                    }

                    // Add item input
                    HStack(spacing: 8) {
                        TextField("Item name", text: $itemName)
                            .font(.caption)
                            .textFieldStyle(.roundedBorder)

                        HStack(spacing: 2) {
                            Text("$")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            TextField("0", text: $itemPlanned)
                                .font(.caption)
                                .keyboardType(.decimalPad)
                                .frame(width: 60)
                                .textFieldStyle(.roundedBorder)
                        }

                        Button {
                            guard !itemName.trimmingCharacters(in: .whitespaces).isEmpty,
                                  let planned = Decimal(string: itemPlanned), planned > 0 else { return }
                            let name = itemName.trimmingCharacters(in: .whitespaces)
                            if viewModel.addItem(categoryType: type, name: name, planned: planned) {
                                itemName = ""
                                itemPlanned = ""
                            }
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .foregroundStyle(.green)
                        }
                        .disabled(itemName.trimmingCharacters(in: .whitespaces).isEmpty || (Decimal(string: itemPlanned) ?? 0) <= 0)
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
                }
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }
}
