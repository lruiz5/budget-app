import Foundation

// MARK: - Onboarding Service
// API methods for onboarding progress tracking

actor OnboardingService {
    static let shared = OnboardingService()
    private let api = APIClient.shared

    private init() {}

    // GET /api/onboarding
    func getStatus() async throws -> OnboardingStatus {
        try await api.get(Constants.API.Endpoints.onboarding, queryParams: nil)
    }

    // POST /api/onboarding — creates record if none exists
    func initialize() async throws -> OnboardingRecord {
        try await api.post(Constants.API.Endpoints.onboarding, body: EmptyBody())
    }

    // PUT /api/onboarding { step: Int }
    func updateStep(_ step: Int) async throws -> SuccessResponse {
        try await api.put(Constants.API.Endpoints.onboarding, body: UpdateStepRequest(step: step))
    }

    // PATCH /api/onboarding { action: "complete" }
    func complete() async throws -> SuccessResponse {
        try await api.patch(Constants.API.Endpoints.onboarding, body: OnboardingActionRequest(action: "complete"))
    }

    // PATCH /api/onboarding { action: "skip" }
    func skip() async throws -> SuccessResponse {
        try await api.patch(Constants.API.Endpoints.onboarding, body: OnboardingActionRequest(action: "skip"))
    }
}

// MARK: - Response Types

struct OnboardingStatus: Decodable {
    let completed: Bool
    let currentStep: Int
    let completedAt: String?
    let skippedAt: String?
}

struct OnboardingRecord: Decodable {
    let id: Int?
    let userId: String?
    let currentStep: Int?
    let completedAt: String?
    let skippedAt: String?
}

// MARK: - Request Types

private struct EmptyBody: Encodable {}

private struct UpdateStepRequest: Encodable {
    let step: Int
}

private struct OnboardingActionRequest: Encodable {
    let action: String
}
