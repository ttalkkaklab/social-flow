# ShootConsole

A macOS app that puts the script on your secondary display and records the main
display. It reads `storyboard/script.md` and shows it scene by scene, and global
hotkeys start and stop the recording and move between scenes without you
touching the app.

It's the tool for the **shooting stage** of the social-flow pipeline:

```
storyboard (script approved) → [shoot console] → ingest (transcribe · align) → produce (edit)
```

## Build

```bash
cd apps/shoot-console
./build-app.sh --run
```

This makes `build/ShootConsole.app`. Move it into Applications or use it where
it is. If you have an Apple Development certificate the script signs with it, so
**permissions survive a rebuild**. Without a certificate it falls back to ad-hoc
signing, and then you have to approve screen recording again on every build.

## Permissions (once)

Run the app once and `ShootConsole` shows up under System Settings → Privacy &
Security → **Screen & System Audio Recording**. Turn it on and **quit and reopen
the app**. Turn the microphone on too, under **Microphone** on the same screen.

An app only lands in that list by asking for the permission itself. But this app
isn't what captures the screen — the `screencapture` that `record.sh` spawns is.
The app had never touched TCC, so it never appeared in the list, and there was
no way to turn it on. Now the app queries the display list through
ScreenCaptureKit once at launch to trigger registration (`Permissions.swift`).
Letting the child do the capture is fine — TCC fixes the responsible process at
spawn time and keeps it even when `nohup` or `disown` changes the parent, so
granting the app permission carries the capture underneath it.

Hit record without the permission and the app blocks it with a banner instead of
calling `record.sh` — the button opens the matching settings pane.

> Measured on macOS 26: `CGRequestScreenCaptureAccess()` neither registers nor
> prompts. `CGPreflightScreenCaptureAccess()` is the accurate way to read the
> state, and registration happens only through the ScreenCaptureKit query. Same
> for the settings URL — the old `com.apple.preference.security` drops you on
> "General", and only `com.apple.settings.PrivacySecurity.extension` goes to the
> right item.

## Folders and lists

The gear button sets two places: the **script folder** and the **output folder**.

- **Script folder** — the app walks it and finds every `script.md`. Point it at
  `data/` and you get a list grouped by channel, showing the title, scene count,
  target length, and modification time. Topics pile up with every shoot, so set
  the root once and after that you pick from the list. Even without setting it,
  ⌘O and drag-and-drop still work.
- **Output folder** — where recordings land. Leave it empty for `~/Movies`.
  Change it and **a recording already rolling still saves where it was headed
  when it started**.

⌘L (or the list button up top) reopens the list with a script still open. The
recording list carries file size and time plus a badge for whether scene marks
were written, and the file being shot right now is marked `Recording` (it isn't
finished yet). **Copy path** on a row grabs the path to hand to
`/social-flow:ingest`.

## How to use it

Open a script (pick it from the list, ⌘O, drop it on the window, or open it with
the app from Finder) and film along the scenes.

| Hotkey | What it does |
|---|---|
| `⌃⌥⌘R` | Start / stop recording |
| `⌥⌘]` | Next scene |
| `⌥⌘[` | Previous scene |
| `⌥⌘\` | Redo this scene (marks a retake) |

**They're global hotkeys** — they fire with the app in the background and the
browser or terminal you're demoing in front. That's the whole point: clicking
the app window on the secondary display moves focus, the menu bar at the top of
the main display changes with it, and that moment goes straight into the
recording.

The top of the window shows the elapsed recording time along with the **input
device and volume**. Plugging in an external mic doesn't change the macOS
default input, so check this line before starting a long take. The gear button
pins the device name and volume (they go straight into `SF_MIC_DEVICE` /
`SF_MIC_VOLUME`).

To the right of the scene title, the time spent on this scene shows against its
target. Past the target it turns orange — a scene over 20 seconds trips a
warning in editing, so reshooting it on the spot is cheaper.

## Output

Recordings save as `<output folder>/social-flow-<topic>-<datetime>.mov` (default
`~/Movies`). Next to it sits `<same name>.mov.scene-marks.json`:

```json
{
  "recording": "/Users/…/Movies/social-flow-…mov",
  "script": "/Volumes/…/storyboard/script.md",
  "topic": "20260730-social-page-1-profile",
  "startedAt": "2026-08-09T12:20:41Z",
  "marks": [
    { "scene": 1, "title": "AI screens the profile image", "t": 0.0,  "event": "enter",  "take": 1, "superseded": false },
    { "scene": 2, "title": "The browser goes to the AI first", "t": 9.4,  "event": "enter",  "take": 1, "superseded": true  },
    { "scene": 2, "title": "The browser goes to the AI first", "t": 21.7, "event": "retake", "take": 2, "superseded": false },
    { "scene": 3, "title": "Wiring up the image tool yourself", "t": 40.2, "event": "enter",  "take": 1, "superseded": false }
  ]
}
```

It's a record of when you moved between scenes. ingest uses it as a hint when
matching script scenes to recording ranges (alignment.json), turning boundaries
it used to guess from transcript sentences alone into something confirmed. It
stays a hint — ingest snaps the actual cuts to silence.

**Reshooting a scene doesn't erase the earlier take; it marks it `superseded:
true`.** Editing uses the marks where `superseded == false`, so picking is
simple, and keeping the discarded take's start time buys two things — when the
same sentence turns up twice in the transcript you can tell the first one is the
dropped take, and which scene you reshot how many times becomes the shooting
record itself. `take` is which attempt at that scene it was.

Marks are sorted by time before they're written — going back to an earlier scene
with ⌥⌘[ and reshooting puts the record order out of step with the real times.

When the shoot is done:

```
/social-flow:ingest <channel> <recording file path> <topic slug>
```

## Things to know

- **Only the main display gets recorded** (`-D 1` in `record.sh`). Keep the app
  on the secondary display and demo on the main one. With a single monitor the
  app is filmed along with everything else, so a warning shows up — the window
  is hidden from screen capture while recording, but you have to have it up to
  read the script, so a secondary display is the safe route.
- **Moving between scenes makes no sound.** A scene change is a silent gap where
  you "stop talking for a second", and that silence is exactly where ingest
  looks for the cut point. Mix in a sound effect and the scene boundary goes off.
- **Quitting the app doesn't stop the recording**, because `record.sh` spawns it
  under `nohup`. A crash won't cost you the take; the trade is that stopping
  without the app means running `record.sh stop <recording file>` in a terminal.
  Quit while recording and the app tells you that path.
- The recording itself is run by `skills/ingest/references/record.sh` as-is.
  `build-app.sh` copies it into the bundle, so **editing record.sh means
  rebuilding the app** before the change takes.

## Layout

| File | What it does |
|---|---|
| `ShootScript.swift` | script.md parser — breaks out scenes, spoken lines, caption notation, screen directions, transitions |
| `Recorder.swift` | calls record.sh; recording state, elapsed time, mic state |
| `Hotkeys.swift` | global hotkeys on Carbon RegisterEventHotKey |
| `SceneMarks.swift` | records scene-change times and writes scene-marks.json |
| `Library.swift` | script-folder and output-folder settings, and the lists built by walking both |
| `AppState.swift` | the state that ties the above together |
| `ContentView.swift` | the screen |
| `ShootConsoleApp.swift` | entry point, window placement (secondary display, excluded from capture) |
