import SwiftUI
import Clerk

struct SettingsView: View {
    @Environment(\.clerk) private var clerk
    @Environment(\.dismiss) private var dismiss
    @State private var showRecurringPayments = false
    @State private var showSignOutConfirm = false

    var body: some View {
        NavigationStack {
            List {
                // User Section
                Section {
                    HStack {
                        Image(systemName: "person.circle.fill")
                            .font(.largeTitle)
                            .foregroundStyle(.green)

                        VStack(alignment: .leading) {
                            Text(userDisplayName)
                                .font(.headline)
                            if let email = userEmail {
                                Text(email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                // Features Section
                Section("Features") {
                    Button {
                        showRecurringPayments = true
                    } label: {
                        Label("Recurring Payments", systemImage: "repeat")
                    }
                    .foregroundStyle(.primary)
                }

                // App Section
                Section("App") {
                    HStack {
                        Label("Version", systemImage: "info.circle")
                        Spacer()
                        Text(Constants.App.version)
                            .foregroundStyle(.secondary)
                    }
                }

                // Account Section
                Section {
                    Button(role: .destructive) {
                        showSignOutConfirm = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(isPresented: $showRecurringPayments) {
                RecurringPaymentsView()
            }
            .confirmationDialog("Sign Out", isPresented: $showSignOutConfirm, titleVisibility: .visible) {
                Button("Sign Out", role: .destructive) {
                    Task {
                        try? await clerk.signOut()
                        await APIClient.shared.setAuthToken(nil)
                        await MainActor.run {
                            dismiss()
                        }
                    }
                }
                Button("Cancel", role: .cancel) { }
            } message: {
                Text("Are you sure you want to sign out?")
            }
        }
    }

    private var userDisplayName: String {
        if let firstName = clerk.user?.firstName {
            return firstName
        }
        return clerk.user?.primaryEmailAddress?.emailAddress ?? "User"
    }

    private var userEmail: String? {
        clerk.user?.primaryEmailAddress?.emailAddress
    }
}

#Preview {
    SettingsView()
}
