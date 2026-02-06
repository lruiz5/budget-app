import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            BudgetTab()
                .tabItem {
                    Label("Budget", systemImage: "dollarsign.circle.fill")
                }
                .tag(0)

            TransactionsTab()
                .tabItem {
                    Label("Transactions", systemImage: "list.bullet.rectangle.fill")
                }
                .tag(1)

            AccountsTab()
                .tabItem {
                    Label("Accounts", systemImage: "building.columns.fill")
                }
                .tag(2)

            InsightsTab()
                .tabItem {
                    Label("Insights", systemImage: "chart.bar.fill")
                }
                .tag(3)
        }
        .tint(.green) // Emerald-like primary color
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
    @StateObject private var viewModel = TransactionsViewModel()
    
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
}
