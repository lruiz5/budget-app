import SwiftUI

// MARK: - App Button Styles
// iOS counterparts of web `components/ui/Button.tsx` variants
// (primary / secondary / ghost / danger / dangerGhost; sizes sm / md / lg).
// Usage: .buttonStyle(.appPrimary), .buttonStyle(.appDanger(size: .lg)), …

enum AppButtonSize {
    case sm, md, lg

    var horizontalPadding: CGFloat {
        switch self {
        case .sm: 12
        case .md: 16
        case .lg: 24
        }
    }

    var verticalPadding: CGFloat {
        switch self {
        case .sm: 6
        case .md: 8
        case .lg: 12
        }
    }

    var font: Font {
        switch self {
        case .sm: .outfitSubheadline
        case .md, .lg: .outfitBody
        }
    }
}

private struct AppButtonLabel: ViewModifier {
    let size: AppButtonSize
    let foreground: Color

    @Environment(\.isEnabled) private var isEnabled

    func body(content: Content) -> some View {
        content
            .font(size.font)
            .fontWeight(.medium)
            .foregroundStyle(foreground)
            .padding(.horizontal, size.horizontalPadding)
            .padding(.vertical, size.verticalPadding)
            .opacity(isEnabled ? 1 : 0.5)
    }
}

struct AppPrimaryButtonStyle: ButtonStyle {
    var size: AppButtonSize = .md

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .modifier(AppButtonLabel(size: size, foreground: .white))
            .background(
                configuration.isPressed ? Color.appPrimaryDark : .appPrimary,
                in: RoundedRectangle(cornerRadius: 8)
            )
    }
}

struct AppSecondaryButtonStyle: ButtonStyle {
    var size: AppButtonSize = .md

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .modifier(AppButtonLabel(size: size, foreground: .appTextSecondary))
            .background(
                configuration.isPressed ? Color.appSurfaceSecondary : .appSurface,
                in: RoundedRectangle(cornerRadius: 8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Color.appBorderStrong)
            )
    }
}

struct AppGhostButtonStyle: ButtonStyle {
    var size: AppButtonSize = .md

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .modifier(AppButtonLabel(size: size, foreground: configuration.isPressed ? .appTextPrimary : .appTextSecondary))
            .background(
                configuration.isPressed ? Color.appSurfaceSecondary : .clear,
                in: RoundedRectangle(cornerRadius: 8)
            )
    }
}

struct AppDangerButtonStyle: ButtonStyle {
    var size: AppButtonSize = .md

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .modifier(AppButtonLabel(size: size, foreground: .white))
            .background(
                Color.appDanger.opacity(configuration.isPressed ? 0.9 : 1),
                in: RoundedRectangle(cornerRadius: 8)
            )
    }
}

struct AppDangerGhostButtonStyle: ButtonStyle {
    var size: AppButtonSize = .md

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .modifier(AppButtonLabel(size: size, foreground: .appDanger))
            .background(
                configuration.isPressed ? Color.appDanger.opacity(0.15) : .appDangerLight,
                in: RoundedRectangle(cornerRadius: 8)
            )
    }
}

// MARK: - Dot-Syntax Accessors

extension ButtonStyle where Self == AppPrimaryButtonStyle {
    static var appPrimary: AppPrimaryButtonStyle { .init() }
    static func appPrimary(size: AppButtonSize) -> AppPrimaryButtonStyle { .init(size: size) }
}

extension ButtonStyle where Self == AppSecondaryButtonStyle {
    static var appSecondary: AppSecondaryButtonStyle { .init() }
    static func appSecondary(size: AppButtonSize) -> AppSecondaryButtonStyle { .init(size: size) }
}

extension ButtonStyle where Self == AppGhostButtonStyle {
    static var appGhost: AppGhostButtonStyle { .init() }
    static func appGhost(size: AppButtonSize) -> AppGhostButtonStyle { .init(size: size) }
}

extension ButtonStyle where Self == AppDangerButtonStyle {
    static var appDanger: AppDangerButtonStyle { .init() }
    static func appDanger(size: AppButtonSize) -> AppDangerButtonStyle { .init(size: size) }
}

extension ButtonStyle where Self == AppDangerGhostButtonStyle {
    static var appDangerGhost: AppDangerGhostButtonStyle { .init() }
    static func appDangerGhost(size: AppButtonSize) -> AppDangerGhostButtonStyle { .init(size: size) }
}

#Preview {
    VStack(spacing: 16) {
        Button("Save changes") {}.buttonStyle(.appPrimary)
        Button("Cancel") {}.buttonStyle(.appSecondary)
        Button("Skip") {}.buttonStyle(.appGhost)
        Button("Delete budget") {}.buttonStyle(.appDanger)
        Button("Remove item") {}.buttonStyle(.appDangerGhost)
        Button("Disabled") {}.buttonStyle(.appPrimary).disabled(true)
        Button("Large primary") {}.buttonStyle(.appPrimary(size: .lg))
    }
    .padding()
}
