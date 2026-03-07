import Foundation

// MARK: - Budget Service
// API methods for budget-related endpoints

actor BudgetService {
    static let shared = BudgetService()
    private let api = APIClient.shared

    private init() {}

    // MARK: - Budgets

    func getBudget(month: Int, year: Int) async throws -> Budget {
        try await api.get("/api/budgets", queryParams: [
            "month": String(month),
            "year": String(year)
        ])
    }

    /// Returns all existing budgets for the user (read-only, no auto-create).
    func listBudgets() async throws -> [Budget] {
        try await api.get("/api/budgets/list")
    }

    func updateBudget(_ budget: BudgetUpdateRequest) async throws -> SuccessResponse {
        try await api.put("/api/budgets", body: budget)
    }

    func copyBudget(fromMonth: Int, fromYear: Int, toMonth: Int, toYear: Int) async throws -> SuccessResponse {
        try await api.post("/api/budgets/copy", body: CopyBudgetRequest(
            sourceMonth: fromMonth,
            sourceYear: fromYear,
            targetMonth: toMonth,
            targetYear: toYear
        ))
    }

    func resetBudget(budgetId: Int, mode: ResetMode) async throws -> SuccessResponse {
        try await api.post("/api/budgets/reset", body: ResetBudgetRequest(
            budgetId: budgetId,
            mode: mode.rawValue
        ))
    }

    // MARK: - Budget Items

    func createBudgetItem(categoryId: Int, name: String, planned: Decimal) async throws -> BudgetItem {
        try await api.post("/api/budget-items", body: CreateBudgetItemRequest(
            categoryId: categoryId,
            name: name,
            planned: String(describing: planned)
        ))
    }

    func updateBudgetItem(id: Int, name: String?, planned: Decimal?, expectedDay: Int? = nil, clearExpectedDay: Bool = false) async throws -> BudgetItem {
        try await api.put("/api/budget-items", body: UpdateBudgetItemRequest(
            id: id,
            name: name,
            planned: planned.map { String(describing: $0) },
            clearExpectedDay: clearExpectedDay,
            expectedDay: expectedDay
        ))
    }

    func deleteBudgetItem(id: Int) async throws -> SuccessResponse {
        try await api.delete("/api/budget-items", queryParams: ["id": String(id)])
    }

    func reorderBudgetItems(items: [ReorderItem]) async throws -> SuccessResponse {
        try await api.put("/api/budget-items/reorder", body: ReorderItemsRequest(
            items: items
        ))
    }

    // MARK: - Budget Categories

    func createCategory(budgetId: Int, name: String, emoji: String) async throws -> BudgetCategory {
        try await api.post("/api/budget-categories", body: CreateCategoryRequest(
            budgetId: budgetId,
            name: name,
            emoji: emoji
        ))
    }

    func deleteCategory(id: Int) async throws -> SuccessResponse {
        try await api.delete("/api/budget-categories", queryParams: ["id": String(id)])
    }
}

// MARK: - Request Types

struct BudgetUpdateRequest: Encodable {
    let id: Int
    let buffer: String
}

struct CopyBudgetRequest: Encodable {
    let sourceMonth: Int
    let sourceYear: Int
    let targetMonth: Int
    let targetYear: Int
}

struct ResetBudgetRequest: Encodable {
    let budgetId: Int
    let mode: String
}

enum ResetMode: String {
    case zero
    case replace
}

struct CreateBudgetItemRequest: Encodable {
    let categoryId: Int
    let name: String
    let planned: String
}

struct UpdateBudgetItemRequest: Encodable {
    let id: Int
    let name: String?
    let planned: String?
    var clearExpectedDay: Bool = false
    var expectedDay: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, planned, expectedDay
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(planned, forKey: .planned)
        if clearExpectedDay {
            try container.encodeNil(forKey: .expectedDay)
        } else {
            try container.encodeIfPresent(expectedDay, forKey: .expectedDay)
        }
    }
}

struct ReorderItemsRequest: Encodable {
    let items: [ReorderItem]
}

struct ReorderItem: Encodable {
    let id: Int
    let order: Int
}

struct CreateCategoryRequest: Encodable {
    let budgetId: Int
    let name: String
    let emoji: String
}
