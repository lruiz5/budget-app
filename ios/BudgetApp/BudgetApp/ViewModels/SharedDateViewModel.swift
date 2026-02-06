import Foundation
import Combine

@MainActor
class SharedDateViewModel: ObservableObject {
    static let shared = SharedDateViewModel()
    
    @Published var selectedMonth: Int
    @Published var selectedYear: Int
    
    private init() {
        let now = Date()
        let calendar = Calendar.current
        // Web app uses 0-indexed months (January=0), so subtract 1 from Swift's 1-indexed months
        self.selectedMonth = calendar.component(.month, from: now) - 1
        self.selectedYear = calendar.component(.year, from: now)
    }
}
