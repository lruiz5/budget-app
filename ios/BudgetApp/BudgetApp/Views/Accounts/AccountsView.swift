import SwiftUI

struct AccountsView: View {
    @StateObject private var viewModel = AccountsViewModel()
    @State private var showAddAccount = false

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView("Loading accounts...")
            } else if viewModel.accounts.isEmpty {
                emptyStateView
            } else {
                accountsList
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddAccount = true
                } label: {
                    Image(systemName: "plus")
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await viewModel.syncAllAccounts() }
                } label: {
                    if viewModel.isSyncing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                }
                .disabled(viewModel.isSyncing || viewModel.accounts.isEmpty)
            }
        }
        .refreshable {
            await viewModel.loadAccounts()
        }
        .task {
            await viewModel.loadAccounts()
        }
        .sheet(isPresented: $showAddAccount) {
            AddAccountSheet(viewModel: viewModel, onComplete: {
                showAddAccount = false
            })
        }
        .alert("Sync Complete", isPresented: $viewModel.showSyncAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(viewModel.syncMessage)
        }
    }

    // MARK: - Accounts List

    private var accountsList: some View {
        List {
            ForEach(viewModel.groupedAccounts, id: \.key) { institution, accounts in
                Section(header: Text(institution)) {
                    ForEach(accounts) { account in
                        AccountCard(account: account)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task {
                                        await viewModel.unlinkAccount(id: account.id)
                                    }
                                } label: {
                                    Label("Unlink", systemImage: "link.badge.minus")
                                }
                            }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Accounts", systemImage: "building.columns")
        } description: {
            Text("Link your bank accounts to automatically import transactions")
        } actions: {
            Button("Link Account") {
                showAddAccount = true
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

// MARK: - Account Card

struct AccountCard: View {
    let account: LinkedAccount

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(account.accountName)
                    .font(.body)
                    .fontWeight(.medium)

                HStack(spacing: 8) {
                    Text(account.accountTypeDisplay)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text("·")
                        .font(.caption)
                        .foregroundStyle(.tertiary)

                    Text(account.lastSyncedDisplay)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            if let lastFour = account.lastFour {
                Text("••••\(lastFour)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Add Account Sheet

struct AddAccountSheet: View {
    @ObservedObject var viewModel: AccountsViewModel
    let onComplete: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var showTellerConnect = false
    @State private var isLinking = false
    @State private var linkError: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "building.columns.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(.green)

                Text("Connect Your Bank")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("We use Teller to securely connect to your bank. Your credentials are never stored on our servers.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                if isLinking {
                    ProgressView("Saving accounts...")
                } else {
                    Button {
                        showTellerConnect = true
                    } label: {
                        Text("Connect Bank")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.horizontal)
                }

                Spacer()
            }
            .padding(.top, 40)
            .navigationTitle("Add Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isLinking)
                }
            }
            .fullScreenCover(isPresented: $showTellerConnect) {
                TellerConnectSheet(
                    onSuccess: { accessToken, enrollmentId in
                        showTellerConnect = false
                        isLinking = true
                        Task {
                            await viewModel.linkAccount(accessToken: accessToken, enrollmentId: enrollmentId)
                            isLinking = false
                            onComplete()
                            dismiss()
                        }
                    },
                    onDismiss: {
                        showTellerConnect = false
                    }
                )
            }
            .alert("Error", isPresented: .init(
                get: { linkError != nil },
                set: { if !$0 { linkError = nil } }
            )) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(linkError ?? "")
            }
        }
    }
}

// MARK: - Teller Connect Sheet (wraps TellerConnectView with nav chrome)

struct TellerConnectSheet: View {
    let onSuccess: (String, String) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            TellerConnectView(
                applicationId: Constants.Teller.applicationId,
                environment: Constants.Teller.environment,
                onSuccess: onSuccess,
                onExit: onDismiss
            )
            .navigationTitle("Link Bank")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onDismiss() }
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        AccountsView()
    }
}
