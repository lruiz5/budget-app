import Foundation

// MARK: - Credit Card Summary
// Per-card payoff for a budget month from GET /api/bank/credit-summary.
// Purchases are budgeted like any spending; payoffs are transfers that only
// move the card's outstanding balance — the goal is $0 left by month end.

struct CreditCardSummary: Decodable, Identifiable, Equatable {
    let accountId: Int
    let accountName: String
    let institutionName: String
    let opening: Decimal // owed at the start of the month
    let charges: Decimal
    let refunds: Decimal
    let payments: Decimal
    let outstanding: Decimal // opening + charges − refunds − payments
    let pendingCharges: Decimal
    let liveOwed: Decimal? // provider balance as an amount owed
    let chargeList: [CreditCardActivity]
    let paymentList: [CreditCardActivity]

    var id: Int { accountId }

    var isPaidOff: Bool { outstanding <= Decimal(string: "0.005")! }

    /// Bank balances exclude pending charges
    var matchesBank: Bool {
        guard let liveOwed else { return false }
        return abs(outstanding - pendingCharges - liveOwed) < Decimal(string: "0.01")!
    }

    enum CodingKeys: String, CodingKey {
        case accountId, accountName, institutionName, opening, charges, refunds, payments
        case outstanding, pendingCharges, liveOwed, chargeList, paymentList
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accountId = try container.decode(Int.self, forKey: .accountId)
        accountName = try container.decode(String.self, forKey: .accountName)
        institutionName = try container.decode(String.self, forKey: .institutionName)
        opening = try container.decodeMoney(forKey: .opening)
        charges = try container.decodeMoney(forKey: .charges)
        refunds = try container.decodeMoney(forKey: .refunds)
        payments = try container.decodeMoney(forKey: .payments)
        outstanding = try container.decodeMoney(forKey: .outstanding)
        pendingCharges = try container.decodeMoney(forKey: .pendingCharges)
        liveOwed = try container.decodeMoneyIfPresent(forKey: .liveOwed)
        chargeList = try container.decodeIfPresent([CreditCardActivity].self, forKey: .chargeList) ?? []
        paymentList = try container.decodeIfPresent([CreditCardActivity].self, forKey: .paymentList) ?? []
    }
}

/// A charge or payment behind the summary totals
struct CreditCardActivity: Decodable, Identifiable, Equatable {
    let id: Int
    let date: String // "YYYY-MM-DD"
    let amount: Decimal
    let merchant: String?
    let status: String?
    let paired: Bool? // payments only — false when no checking payback matched

    var isPending: Bool { status == "pending" }

    var displayDate: String {
        guard let parsed = Formatters.yearMonthDay.date(from: date) else { return date }
        return Formatters.monthDayUTC.string(from: parsed)
    }

    enum CodingKeys: String, CodingKey {
        case id, date, amount, merchant, status, paired
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        date = try container.decode(String.self, forKey: .date)
        amount = try container.decodeMoney(forKey: .amount)
        merchant = try container.decodeIfPresent(String.self, forKey: .merchant)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        paired = try container.decodeIfPresent(Bool.self, forKey: .paired)
    }
}

private extension KeyedDecodingContainer {
    /// Summary amounts are JSON numbers — decoding straight to Decimal goes
    /// through Double and leaves float noise (1865.88 → 1865.8799…), so round to cents
    func decodeMoney(forKey key: Key) throws -> Decimal {
        Self.cents(try decode(Double.self, forKey: key))
    }

    func decodeMoneyIfPresent(forKey key: Key) throws -> Decimal? {
        try decodeIfPresent(Double.self, forKey: key).map(Self.cents)
    }

    private static func cents(_ value: Double) -> Decimal {
        Decimal(string: String(format: "%.2f", value)) ?? 0
    }
}
