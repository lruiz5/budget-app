import Foundation

enum Constants {
    // MARK: - API
    enum API {
        // Production deployment URL
        static let baseURL = "https://tusk.1821926.xyz"

        enum Endpoints {
            static let budgets = "/api/budgets"
            static let budgetsCopy = "/api/budgets/copy"
            static let budgetsReset = "/api/budgets/reset"
            static let budgetItems = "/api/budget-items"
            static let budgetItemsReorder = "/api/budget-items/reorder"
            static let budgetCategories = "/api/budget-categories"
            static let transactions = "/api/transactions"
            static let transactionsSplit = "/api/transactions/split"
            static let recurringPayments = "/api/recurring-payments"
            static let recurringContribute = "/api/recurring-payments/contribute"
            static let recurringReset = "/api/recurring-payments/reset"
            static let tellerAccounts = "/api/teller/accounts"
            static let tellerSync = "/api/teller/sync"
            static let onboarding = "/api/onboarding"
        }
    }

    // MARK: - Clerk
    enum Clerk {
        // TODO: Replace with your Clerk publishable key
        static let publishableKey = "pk_test_c3dlZXBpbmctc2x1Zy0zMS5jbGVyay5hY2NvdW50cy5kZXYk"
    }

    // MARK: - Teller
    enum Teller {
        static let applicationId = "app_pnff4g9cfpm7a902ps000"
        static let environment = "development" // "sandbox", "development", or "production"
    }

    // MARK: - App Info
    enum App {
        static let version = "0.10.0"
        static let buildNumber = "1"
        static let name = "Budget App"
    }

    // MARK: - Default Categories
    static let defaultCategories = [
        "income",
        "giving",
        "household",
        "transportation",
        "food",
        "personal",
        "insurance",
        "saving"
    ]

    // MARK: - Category Emojis
    static let categoryEmojis: [String: String] = [
        "income": "💰",
        "giving": "🤲",
        "household": "🏠",
        "transportation": "🚗",
        "food": "🍽️",
        "personal": "👤",
        "insurance": "🛡️",
        "saving": "💵"
    ]

    // MARK: - Onboarding Suggested Items
    struct SuggestedBudgetItem {
        let name: String
        let planned: Decimal
    }

    static let suggestedBudgetItems: [String: [SuggestedBudgetItem]] = [
        "giving": [SuggestedBudgetItem(name: "Charity", planned: 25)],
        "household": [
            SuggestedBudgetItem(name: "Rent", planned: 1200),
            SuggestedBudgetItem(name: "Utilities", planned: 250),
            SuggestedBudgetItem(name: "Hygiene/Toiletries", planned: 100),
        ],
        "transportation": [
            SuggestedBudgetItem(name: "Maintenance", planned: 150),
            SuggestedBudgetItem(name: "Gas", planned: 150),
        ],
        "food": [
            SuggestedBudgetItem(name: "Groceries", planned: 400),
            SuggestedBudgetItem(name: "Restaurant", planned: 100),
        ],
        "personal": [SuggestedBudgetItem(name: "Spending Money", planned: 100)],
        "insurance": [SuggestedBudgetItem(name: "Auto Insurance", planned: 200)],
        "saving": [SuggestedBudgetItem(name: "Emergency Fund", planned: 500)],
    ]
}
