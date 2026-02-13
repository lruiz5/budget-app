import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var networkMonitor: NetworkMonitor
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
        .overlay(alignment: .top) {
            if !networkMonitor.isConnected {
                HStack(spacing: 6) {
                    Image(systemName: "wifi.slash")
                        .font(.caption2)
                    Text("Offline — View Only")
                        .font(.caption2)
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
        .environmentObject(NetworkMonitor.shared)
}
