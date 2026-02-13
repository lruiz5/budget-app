import Foundation

actor CacheManager {
    static let shared = CacheManager()

    private let cacheDirectory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private init() {
        let cachesURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = cachesURL.appendingPathComponent("BudgetAppCache", isDirectory: true)

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    func save<T: Encodable>(_ value: T, forKey key: String) {
        guard let data = try? encoder.encode(value) else { return }
        let fileURL = cacheDirectory.appendingPathComponent("\(key).json")
        try? data.write(to: fileURL)
    }

    func load<T: Decodable>(forKey key: String) -> T? {
        let fileURL = cacheDirectory.appendingPathComponent("\(key).json")
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? decoder.decode(T.self, from: data)
    }

    func remove(forKey key: String) {
        let fileURL = cacheDirectory.appendingPathComponent("\(key).json")
        try? FileManager.default.removeItem(at: fileURL)
    }

    func removeAll() {
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }
}
