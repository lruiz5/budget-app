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

// MARK: - Tusk Mark Badge

/// Circular crop of the app icon artwork — the shared brand mark for entry screens.
struct TuskMarkBadge: View {
    var size: CGFloat

    var body: some View {
        Image("TuskMark")
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(.white.opacity(0.9), lineWidth: 3))
            .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
    }
}

// MARK: - Sign In Landing View

struct SignInLandingView: View {
    @Binding var showAuth: Bool

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.appPrimary, .appPrimaryDark],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                TuskMarkBadge(size: 150)

                Text("Happy Tusk")
                    .font(.outfit(38))
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .padding(.top, 28)

                Text("Put every dollar to work.")
                    .font(.outfitBody)
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.top, 6)

                Spacer()

                Button {
                    showAuth = true
                } label: {
                    Text("Get started")
                        .font(.outfitHeadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.appPrimaryDark)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(.white, in: Capsule())
                }
                .padding(.horizontal, 32)

                Text("Sign in or create an account")
                    .font(.outfitCaption)
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.top, 12)
                    .padding(.bottom, 40)
            }
        }
    }
}

// MARK: - Splash View

/// Shown while Clerk loads. Background matches the launch screen color exactly
/// so launch → splash reads as one continuous moment; content fades in on top.
private struct SplashView: View {
    @State private var showContent = false

    var body: some View {
        ZStack {
            Color.appPrimary.ignoresSafeArea()

            VStack(spacing: 20) {
                TuskMarkBadge(size: 112)

                Text("Happy Tusk")
                    .font(.outfit(30))
                    .fontWeight(.bold)
                    .foregroundStyle(.white)

                ProgressView()
                    .tint(.white)
                    .padding(.top, 4)
            }
            .opacity(showContent ? 1 : 0)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.35)) {
                showContent = true
            }
        }
    }
}

#Preview {
    SignInLandingView(showAuth: .constant(false))
}
