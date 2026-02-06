import Foundation

// MARK: - API Client
// Handles all HTTP requests to the Next.js backend

actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private var authToken: String?

    private init() {
        self.baseURL = URL(string: Constants.API.baseURL)!

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Auth Token Management

    func setAuthToken(_ token: String?) {
        self.authToken = token
    }

    // MARK: - Generic Request Methods

    func get<T: Decodable>(_ endpoint: String, queryParams: [String: String]? = nil) async throws -> T {
        var urlComponents = URLComponents(url: baseURL.appendingPathComponent(endpoint), resolvingAgainstBaseURL: true)!

        if let params = queryParams {
            // Sort params by key to ensure consistent URL ordering
            urlComponents.queryItems = params.sorted(by: { $0.key < $1.key }).map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        var request = URLRequest(url: urlComponents.url!)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        addHeaders(to: &request)

        return try await performRequest(request)
    }

    func post<T: Decodable, B: Encodable>(_ endpoint: String, body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(endpoint))
        request.httpMethod = "POST"
        request.httpBody = try encoder.encode(body)
        addHeaders(to: &request)

        return try await performRequest(request)
    }

    func put<T: Decodable, B: Encodable>(_ endpoint: String, body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(endpoint))
        request.httpMethod = "PUT"
        request.httpBody = try encoder.encode(body)
        addHeaders(to: &request)

        return try await performRequest(request)
    }

    func delete<T: Decodable>(_ endpoint: String, queryParams: [String: String]? = nil) async throws -> T {
        var urlComponents = URLComponents(url: baseURL.appendingPathComponent(endpoint), resolvingAgainstBaseURL: true)!

        if let params = queryParams {
            urlComponents.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        var request = URLRequest(url: urlComponents.url!)
        request.httpMethod = "DELETE"
        addHeaders(to: &request)

        return try await performRequest(request)
    }

    func patch<T: Decodable, B: Encodable>(_ endpoint: String, body: B) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(endpoint))
        request.httpMethod = "PATCH"
        request.httpBody = try encoder.encode(body)
        addHeaders(to: &request)

        return try await performRequest(request)
    }

    // MARK: - Private Helpers

    private func addHeaders(to request: inout URLRequest) {
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("application/json", forHTTPHeaderField: "Accept")

        if let token = authToken {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        #if DEBUG
        print("🌐 \(request.httpMethod ?? "?") \(request.url?.absoluteString ?? "?")")
        if let body = request.httpBody, let bodyString = String(data: body, encoding: .utf8) {
            print("📤 Body: \(bodyString)")
        }
        #endif

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        #if DEBUG
        print("📥 Status: \(httpResponse.statusCode)")
        if let responseString = String(data: data, encoding: .utf8) {
            print("📦 Response: \(responseString.prefix(500))")
            // Check if transactions exist in raw response
            if responseString.contains("\"transactions\"") {
                let transactionMatches = responseString.components(separatedBy: "\"transactions\":[").count - 1
                let nonEmptyCount = responseString.components(separatedBy: "\"transactions\":[{").count - 1
                print("📊 Found \(transactionMatches) transaction arrays, \(nonEmptyCount) non-empty")
            }
        }
        #endif

        switch httpResponse.statusCode {
        case 200...299:
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                print("❌ Decode error: \(error)")
                throw APIError.decodingError(error)
            }
        case 401:
            throw APIError.unauthorized
        case 403:
            throw APIError.forbidden
        case 404:
            throw APIError.notFound
        case 405:
            throw APIError.methodNotAllowed
        case 500...599:
            throw APIError.serverError(httpResponse.statusCode)
        default:
            throw APIError.httpError(httpResponse.statusCode)
        }
    }
}

// MARK: - API Error Types

enum APIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case forbidden
    case notFound
    case methodNotAllowed
    case serverError(Int)
    case httpError(Int)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Please sign in to continue"
        case .forbidden:
            return "You don't have permission to access this"
        case .notFound:
            return "Resource not found"
        case .methodNotAllowed:
            return "Method not allowed"
        case .serverError(let code):
            return "Server error (\(code))"
        case .httpError(let code):
            return "HTTP error (\(code))"
        case .decodingError(let error):
            return "Failed to parse response: \(error.localizedDescription)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}

// MARK: - Empty Response for endpoints that don't return data

struct EmptyResponse: Decodable {}

// MARK: - Success Response wrapper

struct SuccessResponse: Decodable {
    let success: Bool
    let message: String?
}
