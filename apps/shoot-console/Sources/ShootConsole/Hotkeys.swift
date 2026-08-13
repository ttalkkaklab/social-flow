import AppKit
import Carbon.HIToolbox

// 전역 단축키 — 이 앱에서 빼면 안 되는 기능이다.
//
// 녹화는 메인 모니터만 담고(record.sh -D 1) 앱은 보조 모니터에 둔다. 그런데
// 보조 모니터의 앱 창을 마우스로 클릭하면 포커스가 옮겨가면서 메인 모니터
// 위쪽의 메뉴 막대가 '촬영 콘솔' 로 바뀐다 — 그 순간이 그대로 녹화에 찍힌다.
// 손을 대지 않고 조작할 수단이 있어야 화면이 깨끗하다.
//
// CGEventTap 이 아니라 Carbon 의 RegisterEventHotKey 를 쓰는 이유는 권한이다.
// 이벤트 탭은 손쉬운 사용(Accessibility) 허용을 받아야 하지만, 이쪽은 아무
// 권한 없이 동작한다. API 가 낡았을 뿐 현재도 지원된다.

@MainActor
final class HotkeyCenter {
    static let shared = HotkeyCenter()

    private var actions: [UInt32: () -> Void] = [:]
    private var refs: [EventHotKeyRef?] = []
    private var handlerRef: EventHandlerRef?
    private var nextID: UInt32 = 1

    private init() {}

    struct Combo {
        let keyCode: Int
        let modifiers: UInt32
        /// 화면에 보여줄 표기 — ⌃⌥⌘R 처럼.
        let label: String
    }

    /// 시스템에 조합을 걸고 눌렸을 때 실행할 동작을 등록한다.
    /// 성공하면 noErr, 실패하면 그 이유를 담은 OSStatus 를 돌려준다
    /// (-9878 eventHotKeyExistsErr = 이미 잡혀 있는 조합).
    @discardableResult
    func register(_ combo: Combo, action: @escaping () -> Void) -> OSStatus {
        installHandlerIfNeeded()

        let id = nextID
        nextID += 1

        var ref: EventHotKeyRef?
        let hotKeyID = EventHotKeyID(signature: OSType(0x53484F54), id: id)  // 'SHOT'
        let status = RegisterEventHotKey(
            UInt32(combo.keyCode),
            combo.modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &ref
        )
        guard status == noErr else {
            NSLog("[ShootConsole] 단축키 등록 실패 \(combo.label): OSStatus \(status)")
            return status
        }

        actions[id] = action
        refs.append(ref)
        return noErr
    }

    func unregisterAll() {
        for ref in refs where ref != nil { UnregisterEventHotKey(ref!) }
        refs.removeAll()
        actions.removeAll()
    }

    fileprivate func fire(id: UInt32) {
        actions[id]?()
    }

    private func installHandlerIfNeeded() {
        guard handlerRef == nil else { return }
        var spec = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        InstallEventHandler(GetApplicationEventTarget(), hotkeyCallback, 1, &spec, nil, &handlerRef)
    }
}

// Carbon 콜백은 C 함수 포인터라 컨텍스트를 캡처할 수 없다 — 싱글턴으로 되돌아온다.
private let hotkeyCallback: EventHandlerUPP = { _, event, _ in
    guard let event else { return OSStatus(eventNotHandledErr) }
    var hotKeyID = EventHotKeyID()
    let status = GetEventParameter(
        event,
        EventParamName(kEventParamDirectObject),
        EventParamType(typeEventHotKeyID),
        nil,
        MemoryLayout<EventHotKeyID>.size,
        nil,
        &hotKeyID
    )
    guard status == noErr else { return OSStatus(eventNotHandledErr) }

    let id = hotKeyID.id
    DispatchQueue.main.async { HotkeyCenter.shared.fire(id: id) }
    return noErr
}

// MARK: - 기본 조합

enum Hotkeys {
    private static let cmdOpt = UInt32(cmdKey | optionKey)
    private static let hyper = UInt32(cmdKey | optionKey | controlKey)

    /// 녹화 시작·정지. 잘못 눌리면 테이크가 통째로 날아가므로 일부러 세 손가락
    /// 조합을 쓴다 — 다른 앱이 선점했을 가능성도 사실상 없다.
    static let toggleRecording = HotkeyCenter.Combo(
        keyCode: kVK_ANSI_R, modifiers: hyper, label: "⌃⌥⌘R"
    )

    /// 씬 이동은 촬영 내내 반복해서 누르므로 두 손가락으로 둔다.
    /// ⌘[ ·⌘] 는 브라우저의 뒤로·앞으로, ⇧⌘[ ·⇧⌘] 와 ⌥⌘← ·⌥⌘→ 는 탭 이동이라
    /// 시연 중 자주 쓴다. ⌥⌘[ ·⌥⌘] 는 그 사이에 비어 있는 자리다.
    static let nextScene = HotkeyCenter.Combo(
        keyCode: kVK_ANSI_RightBracket, modifiers: cmdOpt, label: "⌥⌘]"
    )
    static let prevScene = HotkeyCenter.Combo(
        keyCode: kVK_ANSI_LeftBracket, modifiers: cmdOpt, label: "⌥⌘["
    )

    /// 방금 씬을 망쳤다는 표시. ⌥⌘M 은 일부 앱의 '모두 최소화' 와 겹쳐 피했다.
    static let markRetake = HotkeyCenter.Combo(
        keyCode: kVK_ANSI_Backslash, modifiers: cmdOpt, label: "⌥⌘\\"
    )
}
