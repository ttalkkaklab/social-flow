// swift-tools-version: 6.0
import PackageDescription

// Builds the executable only — build-app.sh handles assembling and signing the
// .app bundle. Why there's no Xcode project: this is a six-source shooting aid,
// so there's no reason to maintain a pbxproj, and a readable diff in the repo is
// worth more.
let package = Package(
    name: "ShootConsole",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "ShootConsole",
            path: "Sources/ShootConsole",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
