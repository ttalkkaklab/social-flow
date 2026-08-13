// swift-tools-version: 6.0
import PackageDescription

// 실행 파일만 만든다 — .app 번들 조립·서명은 build-app.sh 가 맡는다.
// Xcode 프로젝트를 두지 않는 이유: 이 앱은 소스 6개짜리 촬영 보조 도구라
// pbxproj 를 관리할 이유가 없고, 저장소에서 diff 가 읽히는 편이 낫다.
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
