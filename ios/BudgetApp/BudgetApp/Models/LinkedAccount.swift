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
    let lastSyncedAt: Date?
    let createdAt: Date

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
