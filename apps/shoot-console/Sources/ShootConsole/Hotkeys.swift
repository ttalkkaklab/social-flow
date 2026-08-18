import AppKit
import Carbon.HIToolbox

// Global hotkeys — the one feature this app can't do without.
//
// The recording covers only the main display (record.sh -D 1) and the app sits
// on the secondary one. But clicking the app window on the secondary display
// moves focus, and the menu bar at the top of the main display flips to
// 'ShootConsole' — that moment lands straight in the recording. Hands-off
// control is what keeps the screen clean.
//
// Why Carbon's RegisterEventHotKey instead of CGEventTap: permissions. An
// event tap needs Accessibility approval; this one works with no permission
// at all. The API is old but still supported.

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
        /// The notation to show on screen — like ⌃⌥⌘R.
        let label: String
    }

    /// Registers a combo with the system and the action to run when pressed.
    /// Returns noErr on success, otherwise the OSStatus explaining why
    /// (-9878 eventHotKeyExistsErr = the combo is already taken).
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
            NSLog("[ShootConsole] hotkey registration failed \(combo.label): OSStatus \(status)")
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

// The Carbon callback is a C function pointer and can't capture context — it
// routes back through the singleton.
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

// MARK: - Default combos

enum Hotkeys {
    private static let cmdOpt = UInt32(cmdKey | optionKey)
    private static let hyper = UInt32(cmdKey | optionKey | controlKey)

    /// Start/stop recording. A stray press loses the whole take, so this is a
    /// deliberate three-finger combo — and the odds of another app holding it
    /// are practically zero.
    static let toggleRecording = HotkeyCenter.Combo(
        keyCode: kVK_ANSI_R, modifiers: hyper, label: "⌃⌥⌘R"
    )

    /// Scene navigation gets pressed over and over throughout the shoot, so it
    /// stays a two-finger combo. ⌘[ and ⌘] are the browser's back/forward,
    /// ⇧⌘[ / ⇧⌘] and ⌥⌘← / ⌥⌘→ switch tabs — all in heavy use mid-demo.
    /// ⌥⌘[ and ⌥⌘] are the free slot in between.
    static let nextScene = HotkeyCenter.Combo(
        keyCode: kVK_ANSI_RightBracket, modifiers: cmdOpt, label: "⌥⌘]"
    )
    static let prevScene = HotkeyCenter.Combo(
        keyCode: kVK_ANSI_LeftBracket, modifiers: cmdOpt, label: "⌥⌘["
    )

    /// Marks the scene just botched. ⌥⌘M was avoided — it collides with
    /// 'minimize all' in some apps.
    static let markRetake = HotkeyCenter.Combo(
        keyCode: kVK_ANSI_Backslash, modifiers: cmdOpt, label: "⌥⌘\\"
    )
}
