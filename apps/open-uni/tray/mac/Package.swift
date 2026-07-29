// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OpenUniRecorderTray",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "OpenUniRecorderTray", path: "Sources")
    ]
)
