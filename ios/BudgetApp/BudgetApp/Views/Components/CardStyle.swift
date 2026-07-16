import SwiftUI

/// Standard surface — iOS counterpart of web `components/ui/Card.tsx`
/// (`bg-surface rounded-xl border border-border shadow-sm`).
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.appSurface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color.appBorder)
            )
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }
}

extension View {
    /// Wraps content in the standard card surface: white, 12pt radius, hairline border, soft shadow.
    /// Apply padding to the content first, then `.cardStyle()`.
    func cardStyle() -> some View {
        modifier(CardStyle())
    }
}
