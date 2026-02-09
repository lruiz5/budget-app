import SwiftUI
import WebKit

/// Wraps Teller Connect's JavaScript SDK in a WKWebView for bank account enrollment.
/// On success, returns the accessToken and enrollmentId to the caller.
struct TellerConnectView: UIViewRepresentable {
    let applicationId: String
    let environment: String // "sandbox", "development", or "production"
    var onSuccess: (String, String) -> Void // (accessToken, enrollmentId)
    var onExit: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onSuccess: onSuccess, onExit: onExit)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let contentController = config.userContentController

        // Register message handlers for JS → Swift communication
        contentController.add(context.coordinator, name: "tellerSuccess")
        contentController.add(context.coordinator, name: "tellerExit")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground

        // Load inline HTML that sets up Teller Connect
        let html = buildHTML()
        webView.loadHTMLString(html, baseURL: URL(string: "https://cdn.teller.io"))

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    private func buildHTML() -> String {
        """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    background-color: \(UITraitCollection.current.userInterfaceStyle == .dark ? "#1c1c1e" : "#f2f2f7");
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                }
                .loading {
                    text-align: center;
                    color: \(UITraitCollection.current.userInterfaceStyle == .dark ? "#ffffff" : "#000000");
                }
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(128,128,128,0.3);
                    border-top: 3px solid #007AFF;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 16px;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="loading" id="loadingIndicator">
                <div class="spinner"></div>
                <p>Connecting to your bank...</p>
            </div>

            <script src="https://cdn.teller.io/connect/connect.js"></script>
            <script>
                document.addEventListener("DOMContentLoaded", function() {
                    var tellerConnect = TellerConnect.setup({
                        applicationId: "\(applicationId)",
                        environment: "\(environment)",
                        products: ["transactions"],
                        onInit: function() {
                            // Teller Connect is ready — open it immediately
                            tellerConnect.open();
                        },
                        onSuccess: function(enrollment) {
                            var data = {
                                accessToken: enrollment.accessToken,
                                enrollmentId: enrollment.enrollment.id
                            };
                            window.webkit.messageHandlers.tellerSuccess.postMessage(JSON.stringify(data));
                        },
                        onExit: function() {
                            window.webkit.messageHandlers.tellerExit.postMessage("exit");
                        }
                    });
                });
            </script>
        </body>
        </html>
        """
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let onSuccess: (String, String) -> Void
        let onExit: () -> Void

        init(onSuccess: @escaping (String, String) -> Void, onExit: @escaping () -> Void) {
            self.onSuccess = onSuccess
            self.onExit = onExit
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "tellerSuccess":
                guard let jsonString = message.body as? String,
                      let data = jsonString.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                      let accessToken = json["accessToken"],
                      let enrollmentId = json["enrollmentId"] else {
                    return
                }
                DispatchQueue.main.async {
                    self.onSuccess(accessToken, enrollmentId)
                }

            case "tellerExit":
                DispatchQueue.main.async {
                    self.onExit()
                }

            default:
                break
            }
        }

        // Allow navigation to Teller domains
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(.allow)
        }
    }
}
