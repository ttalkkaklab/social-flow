import AVFoundation
import AppKit
import CoreGraphics
import ScreenCaptureKit

// Screen recording and microphone permissions.
//
// The System Settings → Privacy & Security → "Screen & System Audio Recording"
// list shows apps that have requested the permission at some point. But this
// app doesn't capture the screen itself — the screencapture that record.sh
// launches does. So the app never touched TCC, never appeared in the list, and
// there was no way to turn it on. That's why we ask directly here.
//
// Letting the child process do the capture is fine to keep. TCC's responsible
// process is fixed at spawn time and survives the parent changing via
// nohup/disown, so once the app has the permission, the screencapture under it
// passes too.
//
// Measured on macOS 26.5 — each API gets used only for what it's good at.
//   CGRequestScreenCaptureAccess()   neither registers nor prompts. Unusable.
//   SCShareableContent query         registers the app in the list. But it
//                                    succeeds even without permission, so it
//                                    can't be used as the verdict.
//   CGPreflightScreenCaptureAccess() reports the state accurately. Doesn't ask.
enum Permissions {

    // MARK: - Screen recording

    /// Checks whether recording is possible right now, and if the permission
    /// is missing, tries to get the app registered.
    ///
    /// Even if the user flips the toggle in Settings, this run doesn't pick it
    /// up — macOS tells them to relaunch the app. So the return value means
    /// "can we record now", not "did the user deny".
    static func checkScreenCapture() async -> Bool {
        if CGPreflightScreenCaptureAccess() { return true }
        // This call exists to trigger list registration. Its return value and
        // whether it throws are ignored.
        _ = try? await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: true
        )
        return CGPreflightScreenCaptureAccess()
    }

    // MARK: - Microphone

    static var microphoneStatus: AVAuthorizationStatus {
        AVCaptureDevice.authorizationStatus(for: .audio)
    }

    /// Same story for the mic — screencapture -g grabs it on the app's behalf,
    /// so the app itself never asked.
    static func requestMicrophone() async {
        guard microphoneStatus == .notDetermined else { return }
        _ = await AVCaptureDevice.requestAccess(for: .audio)
    }

    // MARK: - Opening System Settings

    static func openScreenCaptureSettings() { openPrivacyPane("Privacy_ScreenCapture") }
    static func openMicrophoneSettings() { openPrivacyPane("Privacy_Microphone") }

    /// Measured on macOS 26.5: the old com.apple.preference.security address
    /// only opens the Settings app and lands on "General". The extension bundle
    /// id is what reaches the right pane.
    private static func openPrivacyPane(_ anchor: String) {
        guard let url = URL(
            string: "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?\(anchor)"
        ) else { return }
        NSWorkspace.shared.open(url)
    }
}
