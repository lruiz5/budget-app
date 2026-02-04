import SwiftUI
import Clerk

@main
struct BudgetAppApp: App {
    @State private var clerk = Clerk.shared
    @State private var isLoading = true
    @State private var isAuthReady = false
    @State private var showAuth = false

    var body: some Scene {
        WindowGroup {
            Group {
                if isLoading {
                    ProgressView("Loading...")
                } else if clerk.user != nil && isAuthReady {
                    // User is signed in AND auth token is ready
                    ContentView()
                } else if clerk.user != nil && !isAuthReady {
                    // User is signed in but auth token not yet set
                    ProgressView("Preparing...")
                        .task {
                            // Set up API client with session token before showing ContentView
                            if let token = try? await clerk.session?.getToken()?.jwt {
                                await APIClient.shared.setAuthToken(token)
                            }
                            isAuthReady = true
                        }
                } else {
                    // User needs to sign in
                    SignInLandingView(showAuth: $showAuth)
                        .sheet(isPresented: $showAuth) {
                            AuthView()
                        }
                }
            }
            .environment(\.clerk, clerk)
            .task {
                clerk.configure(publishableKey: Constants.Clerk.publishableKey)
                try? await clerk.load()
                isLoading = false
            }
            .onChange(of: clerk.user) { oldValue, newValue in
                // Reset auth ready state when user changes (sign out/sign in)
                if newValue == nil {
                    isAuthReady = false
                }
            }
        }
    }
}

// MARK: - Sign In Landing View

struct SignInLandingView: View {
    @Binding var showAuth: Bool

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Logo/Header
            VStack(spacing: 12) {
                Image(systemName: "dollarsign.circle.fill")
                    .font(.system(size: 80))
                    .foregroundStyle(.green)

                Text("Budget App")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("Zero-based budgeting made simple")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Sign In Button
            Button {
                showAuth = true
            } label: {
                Text("Sign In")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green)
                    .foregroundStyle(.white)
                    .fontWeight(.semibold)
                    .cornerRadius(10)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 60)
        }
    }
}

#Preview {
    SignInLandingView(showAuth: .constant(false))
}
