import Foundation

struct RecurringPayment: Codable, Identifiable {
    let id: Int
    let name: String
    var amount: Decimal
    let frequency: PaymentFrequency
    var nextDueDate: Date
    var fundedAmount: Decimal
    let categoryType: String?
    let isActive: Bool
    let createdAt: Date?

    var monthlyContribution: Decimal {
        switch frequency {
        case .monthly:
            return amount
        case .quarterly:
            return amount / 3
        case .semiAnnually:
            return amount / 6
        case .annually:
            return amount / 12
        }
    }

    var progress: Double {
        guard amount > 0 else { return 0 }
        return Double(truncating: (fundedAmount / amount) as NSNumber)
    }

    var remaining: Decimal {
        max(0, amount - fundedAmount)
    }

    var daysUntilDue: Int {
        Calendar.current.dateComponents([.day], from: Date(), to: nextDueDate).day ?? 0
    }

    var isUpcoming: Bool {
        daysUntilDue <= 30 && daysUntilDue >= 0
    }

    enum CodingKeys: String, CodingKey {
        case id, name, amount, frequency, nextDueDate, fundedAmount
        case categoryType, isActive, createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        frequency = try container.decode(PaymentFrequency.self, forKey: .frequency)
        categoryType = try container.decodeIfPresent(String.self, forKey: .categoryType)
        isActive = try container.decode(Bool.self, forKey: .isActive)

        // Parse nextDueDate - API returns as "YYYY-MM-DD" string
        if let dateString = try? container.decode(String.self, forKey: .nextDueDate) {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.locale = Locale(identifier: "en_US_POSIX")
            nextDueDate = formatter.date(from: dateString) ?? Date()
        } else {
            nextDueDate = try container.decode(Date.self, forKey: .nextDueDate)
        }

        // Parse createdAt - may be absent or ISO8601
        if let createdString = try? container.decode(String.self, forKey: .createdAt) {
            let isoFormatter = ISO8601DateFormatter()
            isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = isoFormatter.date(from: createdString) {
                createdAt = date
            } else {
                isoFormatter.formatOptions = [.withInternetDateTime]
                createdAt = isoFormatter.date(from: createdString)
            }
        } else {
            createdAt = nil
        }

        // Handle numeric strings from PostgreSQL
        if let amountString = try? container.decode(String.self, forKey: .amount) {
            amount = Decimal(string: amountString) ?? 0
        } else {
            amount = try container.decode(Decimal.self, forKey: .amount)
        }

        if let fundedString = try? container.decode(String.self, forKey: .fundedAmount) {
            fundedAmount = Decimal(string: fundedString) ?? 0
        } else {
            fundedAmount = try container.decode(Decimal.self, forKey: .fundedAmount)
        }
    }
}

enum PaymentFrequency: String, Codable, CaseIterable {
    case monthly
    case quarterly
    case semiAnnually = "semi-annually"
    case annually

    var displayName: String {
        switch self {
        case .monthly: return "Monthly"
        case .quarterly: return "Quarterly"
        case .semiAnnually: return "Semi-Annually"
        case .annually: return "Annually"
        }
    }

    var monthsInCycle: Int {
        switch self {
        case .monthly: return 1
        case .quarterly: return 3
        case .semiAnnually: return 6
        case .annually: return 12
        }
    }
}
