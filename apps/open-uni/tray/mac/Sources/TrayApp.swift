import SwiftUI
import ServiceManagement

final class AppDelegate: NSObject, NSApplicationDelegate {
    var manager: ProcessManager?
    func applicationWillTerminate(_ notification: Notification) {
        manager?.quit()
    }
}

@main
struct TrayApp: App {
    @StateObject private var manager = ProcessManager.shared
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    private static var signalSources: [DispatchSourceSignal] = []

    var body: some Scene {
        MenuBarExtra(content: {
            MenuContent(manager: manager)
        }, label: {
            Text(icon(for: manager.state))
        })
        .menuBarExtraStyle(.menu)
    }

    init() {
        try? SMAppService.mainApp.register()
        manager.start()
        appDelegate.manager = manager
        Self.installTerminationHandlers(for: manager)
    }

    // Covers `kill <pid>` (SIGTERM) and Ctrl+C (SIGINT) so child processes
    // don't outlive an unexpectedly-killed tray. kill -9 can't be caught —
    // that's an unavoidable ceiling of any process-supervisor design.
    private static func installTerminationHandlers(for manager: ProcessManager) {
        for sig in [SIGTERM, SIGINT] {
            signal(sig, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            source.setEventHandler {
                Task { @MainActor in
                    manager.quit()
                    exit(0)
                }
            }
            source.resume()
            signalSources.append(source)
        }
    }

    private func icon(for state: TrayState) -> String {
        switch state {
        case .starting: return "◌"
        case .running: return "●"
        case .apiDown, .webDown: return "◐"
        case .bothDown, .crashed: return "○"
        }
    }
}

private struct MenuContent: View {
    @ObservedObject var manager: ProcessManager

    var body: some View {
        Text(statusText(manager.state))
        Divider()
        Button("Open App") {
            NSWorkspace.shared.open(manager.webURL)
        }
        Button("Restart") {
            manager.restart()
        }
        Divider()
        Button("Quit") {
            manager.quit()
            NSApplication.shared.terminate(nil)
        }
    }

    private func statusText(_ state: TrayState) -> String {
        switch state {
        case .starting: return "Status: Starting…"
        case .running: return "Status: Running"
        case .apiDown: return "Status: API down"
        case .webDown: return "Status: Web down"
        case .bothDown: return "Status: Both down"
        case .crashed: return "Status: Crashed — needs manual Restart"
        }
    }
}
