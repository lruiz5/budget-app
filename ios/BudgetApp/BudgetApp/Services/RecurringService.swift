import Foundation

// MARK: - Recurring Payments Service
// API methods for recurring payment endpoints

actor RecurringService {
    static let shared = RecurringService()
    private let api = APIClient.shared

    private init() {}

    // MARK: - CRUD

    func getRecurringPayments() async throws -> [RecurringPayment] {
        try await api.get("/api/recurring-payments")
    }

    func createRecurringPayment(_ request: CreateRecurringRequest) async throws -> RecurringPayment {
        try await api.post("/api/recurring-payments", body: request)
    }

    func updateRecurringPayment(_ request: UpdateRecurringRequest) async throws -> RecurringPayment {
        try await api.put("/api/recurring-payments", body: request)
    }

    func deleteRecurringPayment(id: Int) async throws -> SuccessResponse {
        try await api.delete("/api/recurring-payments", queryParams: ["id": String(id)])
    }

    // MARK: - Contribute

    func contribute(paymentId: Int, amount: Decimal) async throws -> RecurringPayment {
        try await api.post("/api/recurring-payments/contribute", body: ContributeRequest(
            paymentId: paymentId,
            amount: String(describing: amount)
        ))
    }

    // MARK: - Reset

    func resetFunding(paymentId: Int) async throws -> RecurringPayment {
        try await api.post("/api/recurring-payments/reset", body: ResetFundingRequest(
            paymentId: paymentId
        ))
    }
}

// MARK: - Request Types

struct CreateRecurringRequest: Encodable {
    let name: String
    let amount: String
    let frequency: String
    let nextDueDate: Date
    let categoryType: String?
    let budgetItemId: Int?

    init(name: String, amount: Decimal, frequency: PaymentFrequency, nextDueDate: Date, categoryType: String? = nil, budgetItemId: Int? = nil) {
        self.name = name
        self.amount = String(describing: amount)
        self.frequency = frequency.rawValue
        self.nextDueDate = nextDueDate
        self.categoryType = categoryType
        self.budgetItemId = budgetItemId
    }
}

struct UpdateRecurringRequest: Encodable {
    let id: Int
    let name: String?
    let amount: String?
    let frequency: String?
    let nextDueDate: Date?
    let categoryType: String?
    let isActive: Bool?

    init(id: Int, name: String? = nil, amount: Decimal? = nil, frequency: PaymentFrequency? = nil, nextDueDate: Date? = nil, categoryType: String? = nil, isActive: Bool? = nil) {
        self.id = id
        self.name = name
        self.amount = amount.map { String(describing: $0) }
        self.frequency = frequency?.rawValue
        self.nextDueDate = nextDueDate
        self.categoryType = categoryType
        self.isActive = isActive
    }
}

struct ContributeRequest: Encodable {
    let paymentId: Int
    let amount: String
}

struct ResetFundingRequest: Encodable {
    let paymentId: Int
}
