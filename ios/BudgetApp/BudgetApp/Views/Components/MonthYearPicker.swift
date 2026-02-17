import SwiftUI

struct MonthYearPicker: View {
    @Binding var month: Int
    @Binding var year: Int
    let onChange: (Int, Int) -> Void  // (month, year)

    @State private var showPicker = false
    @State private var tempMonth: Int = 0
    @State private var tempYear: Int = 2026

    private var displayText: String {
        var components = DateComponents()
        // month is 0-indexed (Jan=0), but DateComponents expects 1-indexed
        components.month = month + 1
        components.year = year

        if let date = Calendar.current.date(from: components) {
            return Formatters.monthYear.string(from: date)
        }
        return "\(month)/\(year)"
    }

    var body: some View {
        Button {
            // Copy current values to temp state when opening picker
            tempMonth = month
            tempYear = year
            showPicker = true
        } label: {
            HStack(spacing: 4) {
                Text(displayText)
                    .font(.headline)
                Image(systemName: "chevron.down")
                    .font(.caption)
            }
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showPicker) {
            pickerSheet
        }
    }

    private var pickerSheet: some View {
        NavigationStack {
            VStack(spacing: 20) {
                HStack {
                    // Previous Month
                    Button {
                        goToPreviousMonth()
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.title2)
                    }

                    Spacer()

                    // Current Selection
                    VStack {
                        Text(tempMonthName)
                            .font(.title)
                            .fontWeight(.bold)
                        Text(String(tempYear))
                            .font(.title2)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    // Next Month
                    Button {
                        goToNextMonth()
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.title2)
                    }
                }
                .padding(.horizontal, 40)
                .padding(.top, 20)

                // Month Grid (0-indexed: Jan=0, Dec=11)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 12) {
                    ForEach(0..<12, id: \.self) { m in
                        Button {
                            tempMonth = m
                        } label: {
                            Text(shortMonthName(m))
                                .font(.body)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(tempMonth == m ? Color.green : Color(.systemGray5))
                                .foregroundStyle(tempMonth == m ? .white : .primary)
                                .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)

                // Year Selector
                HStack {
                    Button {
                        tempYear -= 1
                    } label: {
                        Image(systemName: "minus.circle")
                            .font(.title2)
                    }

                    Text(String(tempYear))
                        .font(.title2)
                        .fontWeight(.semibold)
                        .frame(width: 80)

                    Button {
                        tempYear += 1
                    } label: {
                        Image(systemName: "plus.circle")
                            .font(.title2)
                    }
                }
                .padding(.vertical)

                // Today Button
                Button {
                    let now = Date()
                    let calendar = Calendar.current
                    // Convert to 0-indexed month
                    tempMonth = calendar.component(.month, from: now) - 1
                    tempYear = calendar.component(.year, from: now)
                } label: {
                    Text("Go to Today")
                        .font(.body)
                }
                .buttonStyle(.bordered)

                Spacer()
            }
            .navigationTitle("Select Month")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showPicker = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        // Update the bindings
                        month = tempMonth
                        year = tempYear
                        showPicker = false
                        // Call onChange with the selected values
                        onChange(tempMonth, tempYear)
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private var tempMonthName: String {
        var components = DateComponents()
        // tempMonth is 0-indexed, DateComponents expects 1-indexed
        components.month = tempMonth + 1
        if let date = Calendar.current.date(from: components) {
            return Formatters.monthName.string(from: date)
        }
        return ""
    }

    private func shortMonthName(_ m: Int) -> String {
        var components = DateComponents()
        // m is 0-indexed, DateComponents expects 1-indexed
        components.month = m + 1
        if let date = Calendar.current.date(from: components) {
            return Formatters.shortMonthName.string(from: date)
        }
        return ""
    }

    private func goToPreviousMonth() {
        // 0-indexed: Jan=0, Dec=11
        if tempMonth == 0 {
            tempMonth = 11
            tempYear -= 1
        } else {
            tempMonth -= 1
        }
    }

    private func goToNextMonth() {
        // 0-indexed: Jan=0, Dec=11
        if tempMonth == 11 {
            tempMonth = 0
            tempYear += 1
        } else {
            tempMonth += 1
        }
    }
}

#Preview {
    // 0-indexed: 1 = February
    MonthYearPicker(month: .constant(1), year: .constant(2026), onChange: { _, _ in })
}
