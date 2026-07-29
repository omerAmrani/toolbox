import Foundation
import Combine

enum TrayState: Equatable {
    case starting
    case running
    case apiDown
    case webDown
    case bothDown
    case crashed
}

@MainActor
final class ProcessManager: ObservableObject {
    // ponytail: singleton so every `@StateObject var manager = ProcessManager.shared` read
    // in TrayApp.init() resolves to the same instance. Reading a @StateObject-wrapped
    // property directly inside init() (before SwiftUI installs the view into its graph)
    // can hand back a fresh, un-started instance on every access — that's why quit()
    // was firing on an instance whose api/web were still nil while the real child
    // processes belonged to a different instance nobody ever called quit() on.
    static let shared = ProcessManager()

    @Published private(set) var state: TrayState = .starting

    private var api: ChildProcess?
    private var web: ChildProcess?
    private var pollTimer: Timer?
    private let session = URLSession(configuration: .ephemeral)
    private var didStart = false

    /// Idempotent — MenuBarExtra's `.menu` style recreates its content view each time
    /// the menu opens, so this may be called more than once; only the first call spawns.
    func start() {
        guard !didStart else { return }
        didStart = true

        guard let node = resolveNodePath() else {
            state = .crashed
            return
        }

        let busy = portsInUse([apiPort, webPort])
        guard busy.isEmpty else {
            state = .crashed
            return
        }

        api = ChildProcess(
            name: "api", node: node,
            args: ["\(repoRoot)/apps/open-uni-recorder-api/dist/src/main.js"],
            cwd: "\(repoRoot)/apps/open-uni-recorder-api",
            extraEnv: ["NODE_ENV": "production", "PORT": "\(apiPort)"],
            outLogName: "api-out.log", errLogName: "api-err.log",
            healthURL: URL(string: "http://127.0.0.1:\(apiPort)/health/ping")!
        )
        web = ChildProcess(
            name: "web", node: node,
            args: [
                "\(repoRoot)/apps/open-uni-recorder-web/node_modules/next/dist/bin/next",
                "start", "-H", "127.0.0.1", "-p", "\(webPort)",
            ],
            cwd: "\(repoRoot)/apps/open-uni-recorder-web",
            extraEnv: ["NODE_ENV": "production", "NEXT_PUBLIC_API_URL": "http://127.0.0.1:\(apiPort)"],
            outLogName: "web-out.log", errLogName: "web-err.log",
            healthURL: URL(string: "http://127.0.0.1:\(webPort)/api/health")!
        )

        spawnBoth()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.poll() }
        }
    }

    private func spawnBoth() {
        do {
            try api?.spawn { [weak self] in self?.handleCrash(of: "api") }
            try web?.spawn { [weak self] in self?.handleCrash(of: "web") }
        } catch {
            state = .crashed
        }
    }

    private func handleCrash(of name: String) {
        let child = (name == "api") ? api : web
        guard let child else { return }
        if child.recordCrashAndShouldRespawn() {
            try? child.spawn { [weak self] in self?.handleCrash(of: name) }
        } else {
            state = .crashed
        }
    }

    func restart() {
        pollTimer?.invalidate()
        api?.terminate()
        web?.terminate()
        api?.resetCrashState()
        web?.resetCrashState()
        state = .starting
        // give the OS a beat to release the ports before rebinding
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.spawnBoth()
            self?.pollTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.poll() }
            }
        }
    }

    func quit() {
        pollTimer?.invalidate()
        api?.terminate()
        web?.terminate()
    }

    private func poll() {
        guard let api, let web, !api.crashed, !web.crashed else { return }
        Task {
            async let apiUp = Self.checkHealth(api.healthURL, session: session)
            async let webUp = Self.checkHealth(web.healthURL, session: session)
            let (apiOk, webOk) = await (apiUp, webUp)
            await MainActor.run {
                let apiAlive = apiOk && api.isRunning
                let webAlive = webOk && web.isRunning
                switch (apiAlive, webAlive) {
                case (true, true): state = .running
                case (false, true): state = .apiDown
                case (true, false): state = .webDown
                case (false, false): state = .bothDown
                }
            }
        }
    }

    private static func checkHealth(_ url: URL, session: URLSession) async -> Bool {
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        guard let (_, response) = try? await session.data(for: request) else { return false }
        return (response as? HTTPURLResponse)?.statusCode == 200
    }

    var webURL: URL { URL(string: "http://127.0.0.1:\(webPort)")! }
}
