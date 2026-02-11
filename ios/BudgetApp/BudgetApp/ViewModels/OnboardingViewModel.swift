import Combine
import Foundation

// MARK: - Onboarding ViewModel (Purely Educational)

@MainActor
class OnboardingViewModel: ObservableObject {
    // MARK: - Step State
    @Published var currentStep: Int = 1
    @Published var isLoading = true
    @Published var error: String?
    @Published var isSaving = false

    // MARK: - Step 3: Buffer (practice only)
    @Published var bufferAmount: String = ""

    // MARK: - Step 4: Items (local only, not persisted)
    @Published var createdItems: [CreatedItem] = []
    @Published var expandedCategoryType: String?

    // MARK: - Step 5: Transaction (practice only)
    @Published var transactionType: TransactionType = .expense
    @Published var transactionAmount: String = ""
    @Published var transactionDate: Date = Date()
    @Published var transactionDescription: String = ""
    @Published var selectedBudgetItemId: Int?
    @Published var addedTransaction = false

    // MARK: - Services (onboarding tracking only)
    private let onboardingService = OnboardingService.shared

    private var nextLocalId = 1

    let totalSteps = 6

    // MARK: - Static Categories

    /// Category order and display names for onboarding (matches web defaults)
    static let categoryOrder: [(type: String, displayName: String)] = [
        ("giving", "Giving"),
        ("household", "Household"),
        ("transportation", "Transportation"),
        ("food", "Food"),
        ("personal", "Personal"),
        ("insurance", "Insurance"),
        ("saving", "Saving"),
    ]

    // MARK: - Computed

    var canGoBack: Bool { currentStep > 1 && currentStep < 6 }

    /// Expense categories for the items step (static list)
    var expenseCategories: [(type: String, displayName: String)] {
        Self.categoryOrder
    }

    var totalPlanned: Decimal {
        createdItems.reduce(0) { $0 + $1.planned }
    }

    // MARK: - Lifecycle

    func initialize() async {
        isLoading = true
        error = nil

        do {
            // Check current status (resume support)
            let status = try await onboardingService.getStatus()
            if !status.completed && status.currentStep > 1 {
                currentStep = status.currentStep
            }

            // Ensure onboarding record exists
            _ = try await onboardingService.initialize()
        } catch {
            print("[OnboardingVM] Initialize error: \(error.localizedDescription)")
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func nextStep() {
        if currentStep < totalSteps {
            currentStep += 1
        }
    }

    func previousStep() {
        if currentStep > 1 {
            currentStep -= 1
        }
    }

    // MARK: - Step 3: Buffer (practice — no budget API call)

    func saveBuffer() async -> Bool {
        isSaving = true
        error = nil

        do {
            _ = try await onboardingService.updateStep(4)
            isSaving = false
            return true
        } catch {
            print("[OnboardingVM] Save buffer step error: \(error.localizedDescription)")
            self.error = error.localizedDescription
            isSaving = false
            return false
        }
    }

    // MARK: - Step 4: Add Budget Item (local only — no budget API call)

    func addItem(categoryType: String, name: String, planned: Decimal) -> Bool {
        let id = nextLocalId
        nextLocalId += 1
        createdItems.append(CreatedItem(
            id: id,
            categoryType: categoryType,
            name: name,
            planned: planned
        ))
        return true
    }

    func saveItemsStep() async -> Bool {
        do {
            _ = try await onboardingService.updateStep(5)
            return true
        } catch {
            print("[OnboardingVM] Save items step error: \(error.localizedDescription)")
            self.error = error.localizedDescription
            return false
        }
    }

    /// Items created for a specific category type
    func items(for categoryType: String) -> [CreatedItem] {
        createdItems.filter { $0.categoryType.lowercased() == categoryType.lowercased() }
    }

    /// Suggested items not yet created for a category
    func remainingSuggestions(for categoryType: String) -> [Constants.SuggestedBudgetItem] {
        let existing = Set(items(for: categoryType).map { $0.name.lowercased() })
        let suggestions = Constants.suggestedBudgetItems[categoryType.lowercased()] ?? []
        return suggestions.filter { !existing.contains($0.name.lowercased()) }
    }

    // MARK: - Step 5: Transaction (practice — no transaction API call)

    func saveTransaction() async -> Bool {
        guard selectedBudgetItemId != nil else {
            error = "Please select a budget item"
            return false
        }
        guard let amount = Decimal(string: transactionAmount), amount > 0 else {
            error = "Please enter a valid amount"
            return false
        }
        guard !transactionDescription.trimmingCharacters(in: .whitespaces).isEmpty else {
            error = "Please enter a description"
            return false
        }

        isSaving = true
        error = nil

        do {
            _ = try await onboardingService.updateStep(6)
            addedTransaction = true
            isSaving = false
            return true
        } catch {
            print("[OnboardingVM] Save transaction step error: \(error.localizedDescription)")
            self.error = error.localizedDescription
            isSaving = false
            return false
        }
    }

    func skipTransaction() async {
        do {
            _ = try await onboardingService.updateStep(6)
        } catch {
            print("[OnboardingVM] Skip transaction step error: \(error.localizedDescription)")
        }
    }

    // MARK: - Step 6: Complete

    func completeOnboarding() async {
        do {
            _ = try await onboardingService.complete()
        } catch {
            print("[OnboardingVM] Complete error: \(error.localizedDescription)")
        }
    }

    // MARK: - Skip All

    func skipOnboarding() async {
        do {
            _ = try await onboardingService.skip()
        } catch {
            print("[OnboardingVM] Skip error: \(error.localizedDescription)")
        }
    }
}

// MARK: - Supporting Types

struct CreatedItem: Identifiable {
    let id: Int
    let categoryType: String
    let name: String
    let planned: Decimal
}
