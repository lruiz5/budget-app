import Foundation

struct LinkedAccount: Codable, Identifiable {
    let id: Int
    let userId: String
    let tellerAccountId: String
    let accessToken: String
    let institutionName: String
    let accountName: String
    let accountType: String
    let accountSubtype: String?
    let lastFour: String?
    let createdAt: Date

    var displayName: String {
        if let lastFour = lastFour {
            return "\(accountName) (...\(lastFour))"
        }
        return accountName
    }

    var accountTypeDisplay: String {
        accountType.capitalized
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
