import UIKit

enum AvatarManager {
    private static let suiteName = "group.com.happytusk.app"
    private static let avatarDirectory = "avatars"

    /// Generate a stable key from category type and item name.
    /// Name-based so avatars persist across months (item IDs are per-month).
    static func key(categoryType: String, itemName: String) -> String {
        "\(categoryType)_\(itemName)"
            .lowercased()
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "/", with: "_")
    }

    /// Save a UIImage as avatar for the given key. Resizes to 200x200 max.
    static func save(image: UIImage, forKey key: String) -> Bool {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: suiteName
        ) else { return false }

        let dirURL = containerURL.appendingPathComponent(avatarDirectory)
        try? FileManager.default.createDirectory(at: dirURL, withIntermediateDirectories: true)

        let resized = image.resized(toMaxDimension: 200)
        guard let pngData = resized.pngData() else { return false }

        let fileURL = dirURL.appendingPathComponent("\(key).png")
        do {
            try pngData.write(to: fileURL, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    /// Load avatar image for the given key. Used by both app and widget.
    static func load(forKey key: String) -> UIImage? {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: suiteName
        ) else { return nil }

        let fileURL = containerURL
            .appendingPathComponent(avatarDirectory)
            .appendingPathComponent("\(key).png")

        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        return UIImage(contentsOfFile: fileURL.path)
    }

    /// Remove avatar for the given key.
    static func remove(forKey key: String) {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: suiteName
        ) else { return }

        let fileURL = containerURL
            .appendingPathComponent(avatarDirectory)
            .appendingPathComponent("\(key).png")
        try? FileManager.default.removeItem(at: fileURL)
    }

    /// Check if an avatar exists for the given key.
    static func exists(forKey key: String) -> Bool {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: suiteName
        ) else { return false }

        let fileURL = containerURL
            .appendingPathComponent(avatarDirectory)
            .appendingPathComponent("\(key).png")
        return FileManager.default.fileExists(atPath: fileURL.path)
    }
}

// MARK: - UIImage Resize Helper

extension UIImage {
    func resized(toMaxDimension maxDim: CGFloat) -> UIImage {
        let currentMax = max(size.width, size.height)
        guard currentMax > maxDim else { return self }
        let scale = maxDim / currentMax
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}

// MARK: - CGImage Transparent Pixel Trimming

extension CGImage {
    /// Crops out fully transparent edges from an image.
    func trimmingTransparentPixels() -> CGImage? {
        guard let data = dataProvider?.data,
              let bytes = CFDataGetBytePtr(data) else { return nil }

        let bytesPerPixel = bitsPerPixel / 8
        let bytesPerRow = self.bytesPerRow
        let w = width, h = height

        var minX = w, minY = h, maxX = 0, maxY = 0

        for y in 0..<h {
            for x in 0..<w {
                let alpha = bytes[y * bytesPerRow + x * bytesPerPixel + 3]
                if alpha > 0 {
                    minX = min(minX, x)
                    minY = min(minY, y)
                    maxX = max(maxX, x)
                    maxY = max(maxY, y)
                }
            }
        }

        guard maxX >= minX, maxY >= minY else { return nil }

        let rect = CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
        return cropping(to: rect)
    }
}
