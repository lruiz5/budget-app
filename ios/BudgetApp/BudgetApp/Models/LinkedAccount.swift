import Foundation

struct LinkedAccount: Codable, Identifiable {
    let id: Int
    let userId: String
    let tellerAccountId: String
    let tellerEnrollmentId: String?
    let accessToken: String
    let institutionName: String
    let institutionId: String?
    let accountName: String
    let accountType: String
    let accountSubtype: String?
    let lastFour: String?
    let status: String?
    let syncEnabled: Bool
    let syncStartDate: String?
    let lastSyncedAt: Date?
    let createdAt: Date

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        tellerAccountId = try container.decode(String.self, forKey: .tellerAccountId)
        tellerEnrollmentId = try container.decodeIfPresent(String.self, forKey: .tellerEnrollmentId)
        accessToken = try container.decode(String.self, forKey: .accessToken)
        institutionName = try container.decode(String.self, forKey: .institutionName)
        institutionId = try container.decodeIfPresent(String.self, forKey: .institutionId)
        accountName = try container.decode(String.self, forKey: .accountName)
        accountType = try container.decode(String.self, forKey: .accountType)
        accountSubtype = try container.decodeIfPresent(String.self, forKey: .accountSubtype)
        lastFour = try container.decodeIfPresent(String.self, forKey: .lastFour)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        syncEnabled = try container.decodeIfPresent(Bool.self, forKey: .syncEnabled) ?? true
        syncStartDate = try container.decodeIfPresent(String.self, forKey: .syncStartDate)
        lastSyncedAt = try container.decodeIfPresent(Date.self, forKey: .lastSyncedAt)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
    }

    var displayName: String {
        if let lastFour = lastFour {
            return "\(accountName) (...\(lastFour))"
        }
        return accountName
    }

    var accountTypeDisplay: String {
        if let subtype = accountSubtype, !subtype.isEmpty {
            return subtype.replacingOccurrences(of: "_", with: " ").capitalized
        }
        return accountType.capitalized
    }

    var syncStartDateDisplay: String? {
        guard let syncStartDate else { return nil }
        let inputFormatter = DateFormatter()
        inputFormatter.dateFormat = "yyyy-MM-dd"
        inputFormatter.timeZone = TimeZone(identifier: "UTC")
        guard let date = inputFormatter.date(from: syncStartDate) else { return syncStartDate }
        let outputFormatter = DateFormatter()
        outputFormatter.dateStyle = .medium
        outputFormatter.timeZone = TimeZone(identifier: "UTC")
        return outputFormatter.string(from: date)
    }

    var lastSyncedDisplay: String {
        guard let lastSyncedAt else { return "Never synced" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return "Synced \(formatter.localizedString(for: lastSyncedAt, relativeTo: Date()))"
    }
}

// Response wrapper for linked accounts grouped by institution
struct LinkedAccountsResponse: Codable {
    let accounts: [LinkedAccount]
}

// Helper for grouping accounts by institution
extension Array where Element == LinkedAccount {
    var groupedByInstitution: [String: [LinkedAccount]] {
        Dictionary(grouping: self) { $0.institutionName }
    }
}
