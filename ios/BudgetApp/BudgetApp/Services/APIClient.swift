import Foundation

// MARK: - API Client
// Handles all HTTP requests to the Next.js backend

actor APIClient {
    static let shared = APIClient()

    private let baseURL: URL
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private var tokenProvider: (@Sendable () async -> String?)?

    private init() {
        self.baseURL = URL(string: Constants.API.baseURL)!

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601

        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Auth Token Management

    /// Sets a closure that provides a fresh auth token for each request.
    /// Clerk tokens are short-lived (~60s), so this ensures every request uses a valid token.
    func setTokenProvider(_ provider: @escaping @Sendable () async -> String?) {
        self.tokenProvider = provider
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
    }

    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        var request = request

        // Fetch a fresh token for each request (Clerk tokens expire after ~60s)
        if let provider = tokenProvider, let token = await provider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        #if DEBUG
        print("🌐 \(request.httpMethod ?? "?") \(request.url?.absoluteString ?? "?")")
        if let body = request.httpBody, let bodyString = String(data: body, encoding: .utf8) {
            print("📤 Body: \(bodyString)")
        }
        #endif

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

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

        // Parse server error message from response body for non-2xx responses
        let serverMessage = Self.parseErrorMessage(from: data)

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
            throw APIError.notFound(serverMessage)
        case 405:
            throw APIError.methodNotAllowed
        case 500...599:
            throw APIError.serverError(httpResponse.statusCode, serverMessage)
        default:
            throw APIError.httpError(httpResponse.statusCode, serverMessage)
        }
    }

    /// Try to extract an error message from a JSON response body (e.g. `{ "error": "message" }`)
    private static func parseErrorMessage(from data: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json["error"] as? String ?? json["message"] as? String
    }
}

// MARK: - API Error Types

enum APIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case forbidden
    case notFound(String?)
    case methodNotAllowed
    case serverError(Int, String?)
    case httpError(Int, String?)
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
        case .notFound(let message):
            return message ?? "Resource not found"
        case .methodNotAllowed:
            return "Method not allowed"
        case .serverError(let code, let message):
            return message ?? "Server error (\(code))"
        case .httpError(let code, let message):
            return message ?? "Request failed (\(code))"
        case .decodingError(let error):
            return "Failed to parse response: \(error.localizedDescription)"
        case .networkError:
            return "No internet connection. Please check your network and try again."
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
