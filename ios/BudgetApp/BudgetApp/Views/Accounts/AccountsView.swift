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
                AccountsListSkeleton()
                    .background(Color.appSurfaceSecondary)
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
            await viewModel.loadBalances(forceRefresh: true)
        }
        .task {
            await viewModel.loadAccounts()
            await viewModel.loadBalances()
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
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                ForEach(viewModel.groupedAccounts, id: \.key) { institution, accounts in
                    institutionHeader(institution)

                    VStack(spacing: 0) {
                        ForEach(Array(accounts.enumerated()), id: \.element.id) { index, account in
                            AccountCard(
                                account: account,
                                balance: viewModel.balances[String(account.id)],
                                isLoadingBalance: viewModel.isLoadingBalances && viewModel.balances.isEmpty
                            )
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                activeSheet = .accountDetail(account)
                            }

                            if index < accounts.count - 1 {
                                Divider()
                                    .padding(.leading, 16)
                            }
                        }
                    }
                    .cardStyle()
                }
            }
            .padding(16)
        }
        .background(Color.appSurfaceSecondary)
    }

    private func institutionHeader(_ institution: String) -> some View {
        HStack(spacing: 8) {
            InstitutionIcon(name: institution)

            Text(institution)
                .font(.outfitSubheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Menu {
                Button(role: .destructive) {
                    viewModel.institutionToUnlink = institution
                } label: {
                    Label("Remove Institution", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.outfitBody)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 8)
        .padding(.leading, 4)
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
            .buttonStyle(.appPrimary)
        }
    }
}

// MARK: - Account Card

struct AccountCard: View {
    let account: LinkedAccount
    var balance: Decimal?
    var isLoadingBalance: Bool = false

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(account.accountName)
                    .font(.outfitBody)
                    .fontWeight(.medium)

                HStack(spacing: 8) {
                    Text(account.accountTypeDisplay)
                        .font(.outfitCaption)
                        .foregroundStyle(.secondary)

                    Text("·")
                        .font(.outfitCaption)
                        .foregroundStyle(.tertiary)

                    Text(account.lastSyncedDisplay)
                        .font(.outfitCaption)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                if isLoadingBalance {
                    ProgressView()
                        .scaleEffect(0.7)
                } else if let balance {
                    Text(Formatters.currency.string(from: balance as NSDecimalNumber) ?? "$0.00")
                        .font(.outfitBody)
                        .fontWeight(.medium)
                        .monospacedDigit()
                } else if let lastFour = account.lastFour {
                    Text("••••\(lastFour)")
                        .font(.outfitCaption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
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
                        .font(.outfitTitle3)
                        .fontWeight(.semibold)

                    if let lastFour = account.lastFour {
                        Text("••••\(lastFour)")
                            .font(.outfitSubheadline)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }

                    if let balance = viewModel.balances[String(account.id)] {
                        Text(Formatters.currency.string(from: balance as NSDecimalNumber) ?? "$0.00")
                            .font(.outfitTitle2)
                            .fontWeight(.semibold)
                            .monospacedDigit()
                            .padding(.top, 4)
                    }
                }
                .padding(.top, 8)

                // Streaming toggle card
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Transaction Streaming")
                                .font(.outfitHeadline)

                            if isSyncEnabled, let dateStr = viewModel.selectedAccount?.syncStartDateDisplay ?? account.syncStartDateDisplay {
                                Text("Streaming since \(dateStr)")
                                    .font(.outfitCaption)
                                    .foregroundStyle(Color.appPrimary)
                            } else {
                                Text("Turn on to begin syncing transactions automatically")
                                    .font(.outfitCaption)
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

// MARK: - Add Account Sheet (SimpleFIN Setup Token entry)

struct AddAccountSheet: View {
    @ObservedObject var viewModel: AccountsViewModel
    let onComplete: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var setupToken = ""
    @State private var syncStartDate = Date()
    @State private var isConnecting = false
    @State private var connectError: String?

    private var trimmedToken: String {
        setupToken.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 12) {
                            Image(systemName: "building.columns.fill")
                                .font(.outfit(28))
                                .foregroundStyle(Color.appPrimary)

                            Text("Connect Your Bank")
                                .font(.outfitTitle3)
                                .fontWeight(.semibold)
                        }

                        Text("Connect your bank on the SimpleFIN Bridge portal (Settings → New App Connection), then paste the Setup Token below. Tokens are single-use.")
                            .font(.outfitSubheadline)
                            .foregroundStyle(.secondary)

                        Link(destination: URL(string: Constants.SimpleFIN.bridgeURL)!) {
                            Label("Open SimpleFIN Bridge", systemImage: "arrow.up.right.square")
                                .font(.outfitSubheadline)
                                .foregroundStyle(Color.appPrimary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Setup Token") {
                    TextField("Paste your Setup Token", text: $setupToken, axis: .vertical)
                        .lineLimit(4...8)
                        .font(.system(size: 12, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section {
                    DatePicker("Import transactions from", selection: $syncStartDate, displayedComponents: .date)
                        .font(.outfitBody)
                } footer: {
                    Text("Transactions before this date won't be imported — set it to the day after your existing history ends to avoid duplicates.")
                        .font(.outfitCaption)
                }

                if let connectError {
                    Section {
                        Text(connectError)
                            .font(.outfitSubheadline)
                            .foregroundStyle(Color.appDanger)
                    }
                }

                Section {
                    Button {
                        connect()
                    } label: {
                        HStack(spacing: 8) {
                            if isConnecting {
                                ProgressView()
                                    .tint(.white)
                            }
                            Text(isConnecting ? "Connecting..." : "Connect Bank")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.appPrimary)
                    .controlSize(.large)
                    .disabled(isConnecting || trimmedToken.isEmpty)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Add Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isConnecting)
                }
            }
        }
    }

    private func connect() {
        guard !isConnecting else { return }
        isConnecting = true
        connectError = nil
        // Local calendar, not UTC: the string must match the date the picker displays
        let comps = Calendar.current.dateComponents([.year, .month, .day], from: syncStartDate)
        let dateString = String(format: "%04d-%02d-%02d", comps.year ?? 2000, comps.month ?? 1, comps.day ?? 1)
        Task {
            let error = await viewModel.connectSimpleFIN(setupToken: trimmedToken, syncStartDate: dateString)
            isConnecting = false
            if let error {
                connectError = error
            } else {
                onComplete()
                dismiss()
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
            .font(.outfit(size * 0.5))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color.appPrimary, in: Circle())
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
