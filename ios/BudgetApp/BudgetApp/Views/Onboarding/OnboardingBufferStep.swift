import SwiftUI

struct OnboardingBufferStep: View {
    @ObservedObject var viewModel: OnboardingViewModel
    @FocusState private var isAmountFocused: Bool

    private var bufferDecimal: Decimal {
        Decimal(string: viewModel.bufferAmount) ?? 0
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 24) {
                    Image(systemName: "banknote.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.green)
                        .padding(.top, 32)

                    Text("Set Your Starting Balance")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("How much money do you have right now? This becomes your buffer — the starting point for your budget.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)

                    // Amount input
                    HStack(spacing: 4) {
                        Text("$")
                            .font(.system(size: 48, weight: .bold))
                            .foregroundStyle(.secondary)

                        TextField("0", text: $viewModel.bufferAmount)
                            .font(.system(size: 48, weight: .bold))
                            .keyboardType(.decimalPad)
                            .focused($isAmountFocused)
                            .multilineTextAlignment(.leading)
                    }
                    .padding(.horizontal, 40)
                    .padding(.vertical, 16)

                    if bufferDecimal > 0 {
                        Text("Your starting balance: \(bufferDecimal.formatted())")
                            .font(.subheadline)
                            .foregroundStyle(.green)
                            .fontWeight(.medium)
                    }

                    Text("You can always change this later.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let error = viewModel.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal, 24)
                    }
                }
            }
            .onTapGesture { hideKeyboard() }

            // Navigation buttons
            HStack(spacing: 12) {
                Button {
                    viewModel.previousStep()
                } label: {
                    Text("Back")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray5))
                        .foregroundStyle(.primary)
                        .fontWeight(.medium)
                        .cornerRadius(12)
                }

                Button {
                    Task {
                        if await viewModel.saveBuffer() {
                            viewModel.nextStep()
                        }
                    }
                } label: {
                    if viewModel.isSaving {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .cornerRadius(12)
                    } else {
                        Text("Next")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.green)
                            .foregroundStyle(.white)
                            .fontWeight(.semibold)
                            .cornerRadius(12)
                    }
                }
                .disabled(viewModel.isSaving)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
        .onAppear { isAmountFocused = true }
    }
}
