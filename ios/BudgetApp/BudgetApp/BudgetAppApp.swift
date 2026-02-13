import SwiftUI
import Clerk

@main
struct BudgetAppApp: App {
    @State private var clerk = Clerk.shared
    @State private var isLoading = true
    @State private var isAuthReady = false
    @State private var showAuth = false
    @State private var hasCompletedOnboarding: Bool?

    var body: some Scene {
        WindowGroup {
            Group {
                if isLoading {
                    SplashView()
                } else if clerk.user != nil && isAuthReady {
                    // User is signed in AND auth token is ready — check onboarding
                    if let completed = hasCompletedOnboarding {
                        if completed {
                            ContentView()
                        } else {
                            OnboardingFlowView(onComplete: {
                                hasCompletedOnboarding = true
                            })
                        }
                    } else {
                        SplashView()
                            .task {
                                do {
                                    let status = try await OnboardingService.shared.getStatus()
                                    hasCompletedOnboarding = status.completed
                                } catch {
                                    // If check fails, don't block the app
                                    hasCompletedOnboarding = true
                                }
                            }
                    }
                } else if clerk.user != nil && !isAuthReady {
                    // User is signed in but auth token not yet set
                    SplashView()
                        .task {
                            // Set up token provider that fetches a fresh Clerk token per request.
                            // Clerk tokens are short-lived (~60s), so this prevents expiration issues
                            // when navigating between tabs or staying on a screen for a while.
                            await APIClient.shared.setTokenProvider {
                                try? await Clerk.shared.session?.getToken()?.jwt
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
            .environmentObject(NetworkMonitor.shared)
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
                    hasCompletedOnboarding = nil
                    Task { await CacheManager.shared.removeAll() }
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

// MARK: - Splash View

private struct SplashView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "dollarsign.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(.green)

            Text("Budget App")
                .font(.largeTitle)
                .fontWeight(.bold)

            ProgressView()
                .padding(.top, 8)
        }
    }
}

#Preview {
    SignInLandingView(showAuth: .constant(false))
}
