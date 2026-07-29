import Foundation

/// Owns one spawned process: launch, crash bookkeeping (respawn cap), and clean termination.
final class ChildProcess {
    let name: String
    let node: String
    let args: [String]
    let cwd: String
    let extraEnv: [String: String]
    let outLogName: String
    let errLogName: String
    let healthURL: URL

    private(set) var process: Process?
    private var crashTimestamps: [Date] = []
    private(set) var crashed = false
    private var intentionalStop = false

    /// respawn cap: at most 3 crashes within 60s before giving up and requiring manual restart
    private let maxCrashes = 3
    private let crashWindow: TimeInterval = 60

    init(
        name: String, node: String, args: [String], cwd: String,
        extraEnv: [String: String], outLogName: String, errLogName: String, healthURL: URL
    ) {
        self.name = name; self.node = node; self.args = args; self.cwd = cwd
        self.extraEnv = extraEnv; self.outLogName = outLogName; self.errLogName = errLogName
        self.healthURL = healthURL
    }

    var isRunning: Bool { process?.isRunning ?? false }

    /// Spawns the child. `onUnexpectedExit` fires when the process dies for any reason
    /// other than `terminate()` being called deliberately.
    func spawn(onUnexpectedExit: @escaping () -> Void) throws {
        intentionalStop = false
        let p = Process()
        p.executableURL = URL(fileURLWithPath: node)
        p.arguments = args
        p.currentDirectoryURL = URL(fileURLWithPath: cwd)
        p.environment = ProcessInfo.processInfo.environment.merging(extraEnv) { _, new in new }
        p.standardOutput = logFileHandle(name: outLogName)
        p.standardError = logFileHandle(name: errLogName)
        p.terminationHandler = { [weak self] _ in
            guard let self, !self.intentionalStop else { return }
            DispatchQueue.main.async { onUnexpectedExit() }
        }
        try p.run()
        process = p
    }

    func terminate() {
        intentionalStop = true
        if let p = process, p.isRunning { p.terminate() }
        process = nil
    }

    /// Records a crash and reports whether a respawn should be attempted
    /// (false once the cap is exceeded within the rolling window).
    func recordCrashAndShouldRespawn() -> Bool {
        let now = Date()
        crashTimestamps = crashTimestamps.filter { now.timeIntervalSince($0) < crashWindow }
        crashTimestamps.append(now)
        if crashTimestamps.count > maxCrashes {
            crashed = true
            return false
        }
        return true
    }

    func resetCrashState() {
        crashTimestamps = []
        crashed = false
    }
}
