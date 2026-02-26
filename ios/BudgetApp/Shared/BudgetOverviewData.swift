import Foundation

struct BudgetOverviewData: Codable {
    let monthLabel: String
    let incomePlanned: Decimal
    let incomeActual: Decimal
    let expensePlanned: Decimal
    let expenseActual: Decimal
    let lastUpdated: Date

    var incomeProgress: Double {
        guard incomePlanned > 0 else { return 0 }
        return min(1.0, Double(truncating: (incomeActual / incomePlanned) as NSNumber))
    }

    var expenseProgress: Double {
        guard expensePlanned > 0 else { return 0 }
        return min(1.0, Double(truncating: (expenseActual / expensePlanned) as NSNumber))
    }

    var isExpenseOver: Bool {
        expensePlanned > 0 && expenseActual > expensePlanned
    }

    var isIncomeOver: Bool {
        incomePlanned > 0 && incomeActual > incomePlanned
    }

    var expenseRemaining: Decimal {
        max(expensePlanned - expenseActual, 0)
    }
}
