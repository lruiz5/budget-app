import SwiftUI

struct ToastView: View {
    let message: String
    let isError: Bool

    private var tintColor: Color {
        isError ? .red : .green
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .foregroundStyle(.white)

            Text(message)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(tintColor.opacity(0.85), in: Capsule())
        .shadow(color: tintColor.opacity(0.25), radius: 8, y: 4)
    }
}

struct ToastModifier: ViewModifier {
    @Binding var isPresented: Bool
    let message: String
    let isError: Bool
    let duration: TimeInterval

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if isPresented {
                ToastView(message: message, isError: isError)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
                            withAnimation { isPresented = false }
                        }
                    }
                    .zIndex(1)
            }
        }
        .animation(.spring(duration: 0.3), value: isPresented)
    }
}

extension View {
    func toast(isPresented: Binding<Bool>, message: String, isError: Bool = false, duration: TimeInterval = 3) -> some View {
        modifier(ToastModifier(isPresented: isPresented, message: message, isError: isError, duration: duration))
    }
}
