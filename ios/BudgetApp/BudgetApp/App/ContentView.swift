import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var networkMonitor: NetworkMonitor
    @StateObject private var transactionsViewModel = TransactionsViewModel()
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            BudgetTab()
                .tabItem {
                    Label("Budget", systemImage: "dollarsign.circle.fill")
                }
                .tag(0)

            TransactionsTab(viewModel: transactionsViewModel)
                .tabItem {
                    Label("Transactions", systemImage: "list.bullet.rectangle.fill")
                }
                .tag(1)
                .badge(transactionsViewModel.uncategorizedTransactions.count)

            CashFlowTab()
                .tabItem {
                    Label("Cash Flow", systemImage: "arrow.left.arrow.right")
                }
                .tag(2)

            AccountsTab()
                .tabItem {
                    Label("Accounts", systemImage: "building.columns.fill")
                }
                .tag(3)

            InsightsTab()
                .tabItem {
                    Label("Insights", systemImage: "chart.bar.fill")
                }
                .tag(4)
        }
        .tint(.green) // Emerald-like primary color
        .overlay(alignment: .top) {
            if !networkMonitor.isConnected {
                HStack(spacing: 6) {
                    Image(systemName: "wifi.slash")
                        .font(.outfitCaption2)
                    Text("Offline — View Only")
                        .font(.outfitCaption2)
                        .fontWeight(.semibold)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(.gray.opacity(0.85), in: Capsule())
                .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
                .padding(.top, 54)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.3), value: networkMonitor.isConnected)
        .onReceive(NotificationCenter.default.publisher(for: .widgetDeepLink)) { notification in
            guard let url = notification.object as? URL, let host = url.host() else { return }
            switch host {
            case "insights":
                selectedTab = 4
                if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                   let section = components.queryItems?.first(where: { $0.name == "section" })?.value {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        NotificationCenter.default.post(name: .insightsSectionDeepLink, object: section)
                    }
                }
            case "budget":
                selectedTab = 0
                // Forward item ID if present (e.g. happytusk://budget?itemId=123)
                if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                   let itemIdStr = components.queryItems?.first(where: { $0.name == "itemId" })?.value,
                   let itemId = Int(itemIdStr) {
                    NotificationCenter.default.post(name: .budgetItemDeepLink, object: itemId)
                }
            default: break
            }
        }
    }
}

// MARK: - Tab Wrapper Views
// These wrap the main views with navigation and provide settings access

struct BudgetTab: View {
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            BudgetView()
                .navigationTitle("Budget")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape.fill")
                        }
                    }
                }
                .sheet(isPresented: $showSettings) {
                    SettingsView()
                }
        }
    }
}

struct TransactionsTab: View {
    @ObservedObject var viewModel: TransactionsViewModel

    var body: some View {
        NavigationStack {
            TransactionsView(viewModel: viewModel)
                .navigationTitle("Transactions")
                .onAppear {
                    Task {
                        await viewModel.loadTransactions()
                    }
                }
        }
    }
}

struct AccountsTab: View {
    var body: some View {
        NavigationStack {
            AccountsView()
                .navigationTitle("Accounts")
        }
    }
}

struct CashFlowTab: View {
    @StateObject private var budgetVM = BudgetViewModel()

    var body: some View {
        NavigationStack {
            CashFlowView()
                .navigationTitle("Cash Flow")
                .environmentObject(budgetVM)
                .onAppear {
                    Task {
                        await budgetVM.loadBudget()
                    }
                }
        }
    }
}

struct InsightsTab: View {
    var body: some View {
        NavigationStack {
            InsightsView()
                .navigationTitle("Insights")
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(NetworkMonitor.shared)
}
