import SwiftUI
import Clerk

@main
struct BudgetAppApp: App {
    @State private var clerk = Clerk.shared
    @State private var isLoading = true
    @State private var isAuthReady = false
    @State private var showAuth = false
    @State private var hasCompletedOnboarding: Bool?

    init() {
        // Apply Outfit globally to UIKit-backed components (nav bars, tab bars, alerts, etc.)
        let body = UIFont(name: "Outfit", size: 17) ?? .systemFont(ofSize: 17)
        let headline = UIFont(name: "Outfit", size: 17) ?? .boldSystemFont(ofSize: 17)
        let largeTitle = UIFont(name: "Outfit", size: 34) ?? .systemFont(ofSize: 34)

        UILabel.appearance().font = body
        UINavigationBar.appearance().titleTextAttributes = [.font: headline]
        UINavigationBar.appearance().largeTitleTextAttributes = [.font: largeTitle]
        UITabBarItem.appearance().setTitleTextAttributes([.font: UIFont(name: "Outfit", size: 10) ?? .systemFont(ofSize: 10)], for: .normal)
    }

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
            .font(.custom("Outfit", size: 17))
            .environmentObject(NetworkMonitor.shared)
            .environment(\.clerk, clerk)
            .task {
                clerk.configure(publishableKey: Constants.Clerk.publishableKey)
                try? await clerk.load()
                isLoading = false
            }
            .onOpenURL { url in
                NotificationCenter.default.post(name: .widgetDeepLink, object: url)
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
                    .font(.outfit(80))
                    .foregroundStyle(.green)

                Text("Budget App")
                    .font(.outfitLargeTitle)
                    .fontWeight(.bold)

                Text("Zero-based budgeting made simple")
                    .font(.outfitBody)
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
                .font(.outfit(80))
                .foregroundStyle(.green)

            Text("Budget App")
                .font(.outfitLargeTitle)
                .fontWeight(.bold)

            ProgressView()
                .padding(.top, 8)
        }
    }
}

#Preview {
    SignInLandingView(showAuth: .constant(false))
}
