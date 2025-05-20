import FirebaseFunctions

class MealTrackerService {
    private let functions: Functions

    init(functions: Functions) {
        self.functions = functions
    }

    func fetchGlucoseCurve(forMealId mealId: String, completion: @escaping (Result<(points: [GlucoseDataPoint], metadata: GlucoseMetadata?), Error>) -> Void) {
        print("DEBUG: Attempting to fetch glucose curve for mealId: \\(mealId)")

        // Ensure user is authenticated before making the call
        guard let currentUser = Auth.auth().currentUser else {
            print("DEBUG: User not authenticated prior to calling getGlucoseCurve.")
            completion(.failure(CurveError.tokenError("User not authenticated.")))
            return
        }
        
        // The Firebase SDK will automatically handle attaching the ID token and App Check token.
        // We don't need to fetch them manually and add them to the payload.
        let payload: [String: Any] = [
            "mealId": mealId
            // If your function also accepts direct nutritional data as an alternative to mealId,
            // you would construct that payload here instead, or conditionally.
            // e.g., "carbohydrates": directCarbs, "protein": directProtein, etc.
        ]
                
        print("DEBUG: Calling getGlucoseCurve with payload keys: \\(payload.keys.joined(separator: ", ")) for mealId: \\(mealId)")

        self.functions.httpsCallable("getGlucoseCurve").call(payload) { result, error in
            if let error = error as NSError? {
                print("DEBUG: Firebase function call error: \\(error.localizedDescription), domain: \\(error.domain), code: \\(error.code), userInfo: \\(error.userInfo)")
                // Check for specific Firebase Functions error codes
                if error.domain == FunctionsErrorDomain {
                    switch FunctionsErrorCode(rawValue: error.code) {
                    case .unauthenticated:
                        completion(.failure(CurveError.tokenError("Firebase: Unauthenticated. App Check or Auth token failed.")))
                        return
                    case .notFound:
                        completion(.failure(CurveError.backendError("Firebase: Function not found.")))
                        return
                    // Add other specific Firebase error cases if needed
                    default:
                        break
                    }
                }
                completion(.failure(error))
                return
            }
            
            guard let data = result?.data else {
                print("DEBUG: Firebase function result data is nil")
                completion(.failure(CurveError.invalidResponseFormat("Function result data is nil")))
                return
            }

            if let jsonData = try? JSONSerialization.data(withJSONObject: data, options: .prettyPrinted),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                print("DEBUG: Raw response from getGlucoseCurve: \\(jsonString)")
            }
            
            do {
                let responseData = try JSONSerialization.data(withJSONObject: data, options: [])
                let decoder = JSONDecoder()
                let curveResponse = try decoder.decode(GlucoseCurveResponse.self, from: responseData)

                if curveResponse.success {
                    let points = curveResponse.curveData ?? [] 
                    print("DEBUG: Successfully fetched. Points: \\(points.count). Metadata: \\(String(describing: curveResponse.metadata))")
                    completion(.success((points: points, metadata: curveResponse.metadata)))
                } else {
                    let backendErrorMessage = curveResponse.error ?? "Unknown backend error"
                    print("DEBUG: Backend reported failure: \\(backendErrorMessage)")
                    completion(.failure(CurveError.backendError(backendErrorMessage)))
                }
            } catch let decodingError {
                print("DEBUG: Error decoding GlucoseCurveResponse: \\(decodingError.localizedDescription)")
                print("  Detailed decoding error: \\(decodingError)")
                completion(.failure(CurveError.invalidResponseFormat("Failed to decode response: \\(decodingError.localizedDescription)")))
            }
        }
        // The getTokenAndAppCheckToken method is no longer called here to populate the payload.
        // It can be removed if not used elsewhere, or kept if used for other purposes.
    }
}

// GlucoseCurveResponse struct should be defined here or imported if it's not already.
// Ensure GlucoseMetadata is also defined or imported. 