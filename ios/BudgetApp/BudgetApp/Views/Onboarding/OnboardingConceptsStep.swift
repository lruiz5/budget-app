import SwiftUI

struct OnboardingConceptsStep: View {
    @ObservedObject var viewModel: OnboardingViewModel

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 24) {
                    Text("Zero-Based Budgeting")
                        .font(.title2)
                        .fontWeight(.bold)
                        .padding(.top, 24)

                    Text("Give every dollar a job so nothing slips through the cracks.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)

                    // Concept cards
                    VStack(spacing: 16) {
                        conceptCard(
                            icon: "banknote.fill",
                            title: "Start with your buffer",
                            description: "Enter the money you have right now. This is your starting point."
                        )

                        conceptCard(
                            icon: "equal.circle.fill",
                            title: "Assign every dollar",
                            description: "Spread your buffer and income across expense categories until nothing is left."
                        )

                        conceptCard(
                            icon: "target",
                            title: "Stay balanced",
                            description: "When Buffer + Income = Expenses, your budget is balanced and every dollar has a purpose."
                        )
                    }
                    .padding(.horizontal, 20)

                    // Example breakdown
                    exampleCard
                        .padding(.horizontal, 20)
                        .padding(.bottom, 24)
                }
            }

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
                    viewModel.nextStep()
                } label: {
                    Text("Got it!")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .foregroundStyle(.white)
                        .fontWeight(.semibold)
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
    }

    // MARK: - Components

    private func conceptCard(icon: String, title: String, description: String) -> some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.green)
                .frame(width: 44, height: 44)
                .background(Color.green.opacity(0.12))
                .cornerRadius(10)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }

    private var exampleCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Example")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)

            VStack(spacing: 8) {
                exampleRow(label: "Buffer", value: "$500")
                exampleRow(label: "Income", value: "$3,000")
                Divider()
                exampleRow(label: "Available", value: "$3,500", bold: true)
                Divider()
                exampleRow(label: "Rent", value: "-$1,200")
                exampleRow(label: "Groceries", value: "-$400")
                exampleRow(label: "Utilities", value: "-$250")
                exampleRow(label: "Transportation", value: "-$250")
                exampleRow(label: "Personal Spending", value: "-$150")
                exampleRow(label: "Insurance", value: "-$250")
                exampleRow(label: "Savings", value: "-$1,000")
                Divider()
                exampleRow(label: "Left to budget", value: "$0", color: .green, bold: true)
            }
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }

    private func exampleRow(label: String, value: String, color: Color = .primary, bold: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .fontWeight(bold ? .semibold : .regular)
            Spacer()
            Text(value)
                .font(.caption)
                .fontWeight(bold ? .semibold : .regular)
                .foregroundStyle(color)
                .monospacedDigit()
        }
    }
}
