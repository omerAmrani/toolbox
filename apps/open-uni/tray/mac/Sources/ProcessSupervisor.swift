import Foundation

// Repo root resolved at build time from this source file's location
// (tray/mac/Sources/ProcessSupervisor.swift -> repo root is 3 levels up).
let repoRoot = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent() // ProcessSupervisor.swift -> Sources
    .deletingLastPathComponent() // Sources -> mac
    .deletingLastPathComponent() // mac -> tray
    .deletingLastPathComponent() // tray -> repo root
    .path

let apiPort = 3001
let webPort = 3002
let logDir = NSHomeDirectory() + "/Library/Logs/OpenUniRecorder"

func resolveNodePath() -> String? {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = ["-lc", "which node"]
    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = FileHandle.nullDevice
    do {
        try process.run()
        process.waitUntilExit()
    } catch {
        return nil
    }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
    return (path?.isEmpty == false) ? path : nil
}

func portsInUse(_ ports: [Int]) -> [Int] {
    ports.filter { port in
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        process.arguments = ["-nP", "-iTCP:\(port)", "-sTCP:LISTEN"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            return false
        }
        process.waitUntilExit()
        return process.terminationStatus == 0
    }
}

func logFileHandle(name: String) -> FileHandle {
    let path = logDir + "/" + name
    FileManager.default.createFile(atPath: path, contents: nil)
    return FileHandle(forWritingAtPath: path) ?? .standardError
}
