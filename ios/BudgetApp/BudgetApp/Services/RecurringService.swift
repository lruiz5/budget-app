import Foundation

// MARK: - Recurring Payments Service
// API methods for recurring payment endpoints

actor RecurringService {
    static let shared = RecurringService()
    private let api = APIClient.shared

    private init() {}

    // MARK: - CRUD

    func getRecurringPayments() async throws -> [RecurringPayment] {
        try await api.get(Constants.API.Endpoints.recurringPayments)
    }

    func createRecurringPayment(_ request: CreateRecurringRequest) async throws -> RecurringPayment {
        try await api.post(Constants.API.Endpoints.recurringPayments, body: request)
    }

    func updateRecurringPayment(_ request: UpdateRecurringRequest) async throws -> RecurringPayment {
        try await api.put(Constants.API.Endpoints.recurringPayments, body: request)
    }

    func deleteRecurringPayment(id: Int) async throws -> SuccessResponse {
        try await api.delete(Constants.API.Endpoints.recurringPayments, queryParams: ["id": String(id)])
    }

    // MARK: - Contribute

    func contribute(paymentId: Int, amount: Decimal) async throws -> RecurringPayment {
        let response: RecurringPaymentResponse = try await api.post(
            Constants.API.Endpoints.recurringContribute,
            body: ContributeRequest(id: paymentId, amount: String(describing: amount))
        )
        return response.payment
    }

    // MARK: - Reset

    func resetFunding(paymentId: Int) async throws -> RecurringPayment {
        let response: RecurringPaymentResponse = try await api.post(
            Constants.API.Endpoints.recurringReset,
            body: ResetFundingRequest(id: paymentId)
        )
        return response.payment
    }
}

// MARK: - Response Wrapper

struct RecurringPaymentResponse: Decodable {
    let success: Bool
    let payment: RecurringPayment
}

// MARK: - Request Types

struct CreateRecurringRequest: Encodable {
    let name: String
    let amount: String
    let frequency: String
    let nextDueDate: String
    let categoryType: String?
    let budgetItemId: Int?

    init(name: String, amount: Decimal, frequency: PaymentFrequency, nextDueDate: Date, categoryType: String? = nil, budgetItemId: Int? = nil) {
        self.name = name
        self.amount = String(describing: amount)
        self.frequency = frequency.rawValue
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        self.nextDueDate = formatter.string(from: nextDueDate)
        self.categoryType = categoryType
        self.budgetItemId = budgetItemId
    }
}

struct UpdateRecurringRequest: Encodable {
    let id: Int
    let name: String?
    let amount: String?
    let frequency: String?
    let nextDueDate: String?
    let categoryType: String?
    let isActive: Bool?

    init(id: Int, name: String? = nil, amount: Decimal? = nil, frequency: PaymentFrequency? = nil, nextDueDate: Date? = nil, categoryType: String? = nil, isActive: Bool? = nil) {
        self.id = id
        self.name = name
        self.amount = amount.map { String(describing: $0) }
        self.frequency = frequency?.rawValue
        if let nextDueDate {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.locale = Locale(identifier: "en_US_POSIX")
            self.nextDueDate = formatter.string(from: nextDueDate)
        } else {
            self.nextDueDate = nil
        }
        self.categoryType = categoryType
        self.isActive = isActive
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(amount, forKey: .amount)
        try container.encodeIfPresent(frequency, forKey: .frequency)
        try container.encodeIfPresent(nextDueDate, forKey: .nextDueDate)
        try container.encodeIfPresent(categoryType, forKey: .categoryType)
        try container.encodeIfPresent(isActive, forKey: .isActive)
    }

    enum CodingKeys: String, CodingKey {
        case id, name, amount, frequency, nextDueDate, categoryType, isActive
    }
}

struct ContributeRequest: Encodable {
    let id: Int
    let amount: String
}

struct ResetFundingRequest: Encodable {
    let id: Int
}
