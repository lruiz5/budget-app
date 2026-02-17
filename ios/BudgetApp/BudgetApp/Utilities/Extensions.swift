import Foundation
import SwiftUI

// MARK: - Cached Formatters

enum Formatters {
    static let currency: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        return f
    }()

    static let decimal: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    static let dateShort: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        return f
    }()

    static let dateMedium: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f
    }()

    static let yearMonthDay: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    static let iso8601WithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let iso8601: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static let monthName: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMMM"
        return f
    }()

    static let shortMonthName: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM"
        return f
    }()

    static let monthYear: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMMM yyyy"
        return f
    }()

    static let shortMonthYear: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "MMM yyyy"
        return f
    }()

    static let weekdayShort: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE"
        return f
    }()

    static let currencyWhole: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = 0
        return f
    }()

    static let currencyCompact: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = 0
        return f
    }()

    // UTC date formatters for transaction dates (parsed as midnight UTC)
    static let dateShortUTC: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    static let dateMediumUTC: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    static let dateLongUTC: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .long
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()
}

// MARK: - Decimal Extensions

extension Decimal {
    var doubleValue: Double {
        NSDecimalNumber(decimal: self).doubleValue
    }

    func formatted(as style: NumberFormatter.Style = .currency) -> String {
        let formatter = style == .currency ? Formatters.currency : Formatters.decimal
        return formatter.string(from: self as NSNumber) ?? "$0.00"
    }
}

// MARK: - Date Extensions

extension Date {
    var startOfMonth: Date {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.year, .month], from: self)
        return calendar.date(from: components) ?? self
    }

    var endOfMonth: Date {
        let calendar = Calendar.current
        guard let startOfNextMonth = calendar.date(byAdding: .month, value: 1, to: startOfMonth) else {
            return self
        }
        return calendar.date(byAdding: .day, value: -1, to: startOfNextMonth) ?? self
    }

    func formatted(style: DateFormatter.Style) -> String {
        let formatter = style == .short ? Formatters.dateShort : Formatters.dateMedium
        return formatter.string(from: self)
    }
}

// MARK: - Color Extensions

extension Color {
    static let appGreen = Color(red: 5/255, green: 150/255, blue: 105/255) // Emerald 600
    static let appGreenLight = Color(red: 16/255, green: 185/255, blue: 129/255) // Emerald 500

    static let income = Color.green
    static let expense = Color.primary
    static let overBudget = Color.red
    static let underBudget = Color.green
}

// MARK: - View Extensions

extension View {
    func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

// MARK: - String Extensions

extension String {
    var isValidEmail: Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: self)
    }

    func toDecimal() -> Decimal? {
        // Remove currency symbols and whitespace
        let cleaned = self.replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        return Decimal(string: cleaned)
    }
}

// MARK: - Array Extensions

extension Array {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
