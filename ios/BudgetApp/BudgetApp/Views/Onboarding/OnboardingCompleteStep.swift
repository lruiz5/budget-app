import SwiftUI

struct OnboardingCompleteStep: View {
    @ObservedObject var viewModel: OnboardingViewModel
    let onComplete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 24) {
                    Spacer().frame(height: 40)

                    Text("🎉")
                        .font(.system(size: 64))

                    Text("You're All Set!")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("Head to your budget to set things up for real.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    // Summary card
                    VStack(spacing: 12) {
                        Text("What you practiced")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        summaryRow(icon: "banknote.fill", label: "Buffer", value: (Decimal(string: viewModel.bufferAmount) ?? 0).formatted())

                        summaryRow(icon: "list.bullet", label: "Budget items", value: "\(viewModel.createdItems.count) items")

                        summaryRow(icon: "dollarsign.circle.fill", label: "Total planned", value: viewModel.totalPlanned.formatted())

                        summaryRow(
                            icon: viewModel.addedTransaction ? "checkmark.circle.fill" : "minus.circle",
                            label: "First transaction",
                            value: viewModel.addedTransaction ? "Added" : "Skipped",
                            valueColor: viewModel.addedTransaction ? .green : .secondary
                        )
                    }
                    .padding(16)
                    .background(Color(.secondarySystemGroupedBackground))
                    .cornerRadius(12)
                    .padding(.horizontal, 20)

                    // Next steps
                    VStack(spacing: 12) {
                        Text("What's next?")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        nextStepRow(icon: "building.columns.fill", text: "Connect a bank account to import transactions automatically")
                        nextStepRow(icon: "arrow.triangle.2.circlepath", text: "Set up recurring payments for bills you pay regularly")
                        nextStepRow(icon: "chart.bar.fill", text: "Check Insights for spending charts and monthly reports")
                    }
                    .padding(16)
                    .background(Color(.secondarySystemGroupedBackground))
                    .cornerRadius(12)
                    .padding(.horizontal, 20)
                }
                .padding(.bottom, 24)
            }

            Button {
                onComplete()
            } label: {
                Text("Go to Budget")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green)
                    .foregroundStyle(.white)
                    .fontWeight(.semibold)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
        .task {
            await viewModel.completeOnboarding()
        }
    }

    // MARK: - Components

    private func summaryRow(icon: String, label: String, value: String, valueColor: Color = .primary) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(.green)
                .frame(width: 24)
            Text(label)
                .font(.subheadline)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(valueColor)
        }
    }

    private func nextStepRow(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.green)
                .frame(width: 24)
            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
