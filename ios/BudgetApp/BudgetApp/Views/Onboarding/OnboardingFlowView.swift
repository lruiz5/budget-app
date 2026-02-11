import SwiftUI

struct OnboardingFlowView: View {
    let onComplete: () -> Void

    @StateObject private var viewModel = OnboardingViewModel()

    var body: some View {
        VStack(spacing: 0) {
            if !viewModel.isLoading {
                headerView
            }

            if viewModel.isLoading {
                Spacer()
                ProgressView("Setting up...")
                Spacer()
            } else {
                stepContent
            }
        }
        .task {
            await viewModel.initialize()
        }
    }

    // MARK: - Header

    @ViewBuilder
    private var headerView: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Step \(viewModel.currentStep) of \(viewModel.totalSteps)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if viewModel.currentStep < viewModel.totalSteps {
                    Button("Skip setup") {
                        Task {
                            await viewModel.skipOnboarding()
                            onComplete()
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            // Segmented progress bar
            HStack(spacing: 4) {
                ForEach(1...viewModel.totalSteps, id: \.self) { step in
                    Capsule()
                        .fill(step < viewModel.currentStep ? Color.green
                              : step == viewModel.currentStep ? Color.accentColor
                              : Color(.systemGray4))
                        .frame(height: 4)
                }
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Step Content

    @ViewBuilder
    private var stepContent: some View {
        Group {
            switch viewModel.currentStep {
            case 1:
                OnboardingWelcomeStep(viewModel: viewModel)
            case 2:
                OnboardingConceptsStep(viewModel: viewModel)
            case 3:
                OnboardingBufferStep(viewModel: viewModel)
            case 4:
                OnboardingItemsStep(viewModel: viewModel)
            case 5:
                OnboardingTransactionStep(viewModel: viewModel)
            case 6:
                OnboardingCompleteStep(viewModel: viewModel, onComplete: onComplete)
            default:
                EmptyView()
            }
        }
        .transition(.asymmetric(
            insertion: .move(edge: .trailing),
            removal: .move(edge: .leading)
        ))
        .animation(.easeInOut(duration: 0.3), value: viewModel.currentStep)
    }
}
