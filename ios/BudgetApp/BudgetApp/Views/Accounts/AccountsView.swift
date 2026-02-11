import SwiftUI

// MARK: - Active Sheet Enum (single .sheet pattern)

enum AccountActiveSheet: Identifiable {
    case addAccount
    case accountDetail(LinkedAccount)

    var id: String {
        switch self {
        case .addAccount: return "add"
        case .accountDetail(let a): return "detail-\(a.id)"
        }
    }
}

struct AccountsView: View {
    @StateObject private var viewModel = AccountsViewModel()
    @State private var activeSheet: AccountActiveSheet?

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
                    activeSheet = .addAccount
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable {
            await viewModel.loadAccounts()
        }
        .task {
            await viewModel.loadAccounts()
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .addAccount:
                AddAccountSheet(viewModel: viewModel, onComplete: {
                    activeSheet = nil
                })
            case .accountDetail(let account):
                AccountDetailSheet(account: account, viewModel: viewModel)
                    .presentationDetents([.medium])
            }
        }
        .alert(
            "Remove \(viewModel.institutionToUnlink ?? "")?",
            isPresented: Binding(
                get: { viewModel.institutionToUnlink != nil },
                set: { if !$0 { viewModel.institutionToUnlink = nil } }
            )
        ) {
            Button("Remove", role: .destructive) {
                if let name = viewModel.institutionToUnlink {
                    Task { await viewModel.unlinkInstitution(name: name) }
                }
            }
            Button("Cancel", role: .cancel) {
                viewModel.institutionToUnlink = nil
            }
        } message: {
            Text("This will unlink all accounts from this institution.")
        }
        .toast(
            isPresented: $viewModel.showToast,
            message: viewModel.toastMessage ?? "",
            isError: viewModel.isToastError
        )
    }

    // MARK: - Accounts List

    private var accountsList: some View {
        List {
            ForEach(viewModel.groupedAccounts, id: \.key) { institution, accounts in
                Section {
                    ForEach(accounts) { account in
                        AccountCard(account: account)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                activeSheet = .accountDetail(account)
                            }
                    }
                } header: {
                    HStack(spacing: 8) {
                        InstitutionIcon(name: institution)

                        Text(institution)
                        Spacer()
                        Menu {
                            Button(role: .destructive) {
                                viewModel.institutionToUnlink = institution
                            } label: {
                                Label("Remove Institution", systemImage: "trash")
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .font(.body)
                                .foregroundStyle(.secondary)
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
                activeSheet = .addAccount
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

// MARK: - Account Detail Sheet

struct AccountDetailSheet: View {
    let account: LinkedAccount
    @ObservedObject var viewModel: AccountsViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var isSyncEnabled: Bool
    @State private var isUpdating = false

    init(account: LinkedAccount, viewModel: AccountsViewModel) {
        self.account = account
        self.viewModel = viewModel
        _isSyncEnabled = State(initialValue: account.syncEnabled)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Account header
                VStack(spacing: 8) {
                    InstitutionIcon(name: account.institutionName, size: 56)

                    Text(account.accountName)
                        .font(.title3)
                        .fontWeight(.semibold)

                    if let lastFour = account.lastFour {
                        Text("••••\(lastFour)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                }
                .padding(.top, 8)

                // Streaming toggle card
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Transaction Streaming")
                                .font(.headline)

                            if isSyncEnabled, let dateStr = viewModel.selectedAccount?.syncStartDateDisplay ?? account.syncStartDateDisplay {
                                Text("Streaming since \(dateStr)")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            } else {
                                Text("Turn on to begin syncing transactions automatically")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Spacer()

                        if isUpdating {
                            ProgressView()
                        } else {
                            Toggle("", isOn: $isSyncEnabled)
                                .labelsHidden()
                        }
                    }
                }
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)

                Spacer()
            }
            .navigationTitle(account.institutionName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onChange(of: isSyncEnabled) { _, newValue in
                guard newValue != account.syncEnabled else { return }
                isUpdating = true
                Task {
                    await viewModel.toggleSync(account: account, enabled: newValue)
                    // Revert toggle if server state differs (error case)
                    if let current = viewModel.selectedAccount {
                        isSyncEnabled = current.syncEnabled
                    }
                    isUpdating = false
                }
            }
        }
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

// MARK: - Institution Icon

struct InstitutionIcon: View {
    let name: String
    private let size: CGFloat

    init(name: String, size: CGFloat = 28) {
        self.name = name
        self.size = size
    }

    var body: some View {
        if let domain = Self.domainFor(name) {
            AsyncImage(url: URL(string: "https://www.google.com/s2/favicons?domain=\(domain)&sz=128")) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                        .frame(width: size, height: size)
                        .clipShape(Circle())
                case .failure:
                    defaultIcon
                default:
                    defaultIcon
                }
            }
        } else {
            defaultIcon
        }
    }

    private var defaultIcon: some View {
        Image(systemName: "building.columns.fill")
            .font(.system(size: size * 0.5))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color.green, in: Circle())
    }

    /// Maps known institution names to their website domains for favicon lookup.
    /// Add entries here as users link new banks.
    private static func domainFor(_ institution: String) -> String? {
        let key = institution.lowercased()
        let mapping: [String: String] = [
            "chase": "chase.com",
            "bank of america": "bankofamerica.com",
            "wells fargo": "wellsfargo.com",
            "citibank": "citibank.com",
            "citi": "citibank.com",
            "capital one": "capitalone.com",
            "us bank": "usbank.com",
            "u.s. bank": "usbank.com",
            "pnc": "pnc.com",
            "pnc bank": "pnc.com",
            "truist": "truist.com",
            "td bank": "td.com",
            "ally": "ally.com",
            "ally bank": "ally.com",
            "discover": "discover.com",
            "discover bank": "discover.com",
            "american express": "americanexpress.com",
            "amex": "americanexpress.com",
            "charles schwab": "schwab.com",
            "schwab": "schwab.com",
            "fidelity": "fidelity.com",
            "vanguard": "vanguard.com",
            "navy federal": "navyfederal.org",
            "navy federal credit union": "navyfederal.org",
            "usaa": "usaa.com",
            "marcus": "marcus.com",
            "goldman sachs": "goldmansachs.com",
            "sofi": "sofi.com",
            "chime": "chime.com",
            "citizens bank": "citizensbank.com",
            "citizens": "citizensbank.com",
            "huntington": "huntington.com",
            "huntington bank": "huntington.com",
            "regions": "regions.com",
            "regions bank": "regions.com",
            "fifth third": "53.com",
            "fifth third bank": "53.com",
            "m&t bank": "mtb.com",
            "keybank": "key.com",
            "bmo": "bmo.com",
            "first citizens": "firstcitizens.com",
            "synchrony": "synchrony.com",
            "synchrony bank": "synchrony.com",
            "simple": "simple.com",
            "robinhood": "robinhood.com",
            "paypal": "paypal.com",
            "venmo": "venmo.com",
        ]
        return mapping[key]
    }
}

#Preview {
    NavigationStack {
        AccountsView()
    }
}
