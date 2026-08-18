# Setting the shorts portrait surface (`oar*`) frame — the channel-dedicated Android emulator adb procedure

`thumbnailFilePath` (the `thumbnails.set` API) only changes the **landscape surface**
(hq720/maxresdefault — search results, link previews, embeds, ordinary suggestions).
The **portrait frame (`oar*`)** used by the shorts feed, the channel shorts tab and
shorts search results changes **only through frame selection in the YouTube native
app** (not via the API or web Studio — measured on fect 2026-07-27, reconfirmed on
ttalkkak-lab 2026-08-13). Leave it unset and YouTube auto-picks a random mid-video
frame and shows it as the shorts first frame. A YouTube publish isn't finished until
this step is done (publish SKILL §3).

> Since 2026-07-27 YouTube has officially supported custom shorts thumbnail uploads
> (desktop Studio), but it's rolling out to YPP channels first — for a non-YPP channel
> this procedure is the only way.

## Prerequisite — a channel-dedicated AVD

- **Keep one AVD per channel (operating brand).** The Google account that owns the
  channel differs per channel, so reusing another channel's or project's AVD leads to
  editing from someone else's account. Write the AVD name and the login account into
  that channel's `data/<channel>/profile.md` §4
  (e.g. my-channel = `MyChannel_Phone_API36`).
- Build the AVD from a **Play Store image** (YouTube pre-installed):
  `avdmanager create avd -n <name> -k "system-images;android-36;google_apis_playstore;arm64-v8a" -d medium_phone`
- **Boot it in snapshot-saving mode** — boot with `-no-snapshot-save` and the login and
  PIN are lost on shutdown (measured on fect: the whole setup vanished and we had to
  start again from the login).
- **Set the PIN before adding the account**: `adb shell locksettings set-pin 1234`.
  With a Workspace org policy (`DeviceManagementScreenlockRequired`) in place, the
  account won't even appear in the list without a PIN.
- Add the account (needs the user — password, two-factor):
  `adb shell am start -a android.settings.ADD_ACCOUNT_SETTINGS` → Google →
  get past "Sign in with ease" (the phone-number lookup) with
  **NEXT → fail → SIGN IN ANOTHER WAY** (SKIP has been measured to close the whole
  flow and bounce back to the home screen). Fill the email in over adb and hand over
  to the user starting at the password.
- **If the pre-installed YouTube is an old version it refuses to run** (only the
  "Update available" screen shows — measured 2026-08-13, 19.x). Update it from the
  Play Store after logging in (a few minutes; poll
  `dumpsys package com.google.android.youtube | grep versionName` to tell when it's
  done).
- YouTube app → avatar → Switch accounts → pick the **channel (brand) row** — the row
  with the channel name on it, not the email row. This is what decides who publishes
  and edits.

## Procedure (~60 seconds per video)

Below is the path that **ran through to success** on a ttalkkak-lab episode on
2026-08-14 (1080×2400 · API 36). The coordinates are what we measured then, so treat
them as a reference and pull them again per screen with `uiautomator dump`.

1. `emulator -avd <channel AVD>` — boot with the snapshot kept (never
   `-no-snapshot-save`). Wait for boot with
   `until [ "$(adb shell getprop sys.boot_completed|tr -d '\r')" = 1 ]`.
   **Check `adb shell date` before going in** (see the clock trap below).
2. **Launch the app with `am start -n`.**

   ```bash
   adb shell am start -n com.google.android.youtube/com.google.android.apps.youtube.app.WatchWhileActivity
   ```

   ⚠ `monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1`
   opens the **Play Store's YouTube detail page** instead (measured 2026-08-14).
   Mistake that for the app screen and your taps land somewhere else entirely.
3. Bottom **You** (≈972,2274) → **Your videos** (≈550,1714) → the channel page video grid.
4. **More actions (⋮)** on the target video's tile → **Edit** → the Edit video screen.
   - ⚠ **Don't use the ⋮ at the top of the shorts player** — the "Swipe up for next
     video" coach mark keeps reappearing and swallows every tap in the top row. Only
     the channel-page path is reliable.
   - Every tile in the grid has its own `More actions` — pick the target tile **by x
     coordinate, not by dump order** (first tile ≈323, second ≈684, third ≈1045).
5. **Edit thumbnail** (the pencil, ≈85,274) → frame picker → target frame → the check
   (✓ ≈985,141) → **Save** (≈946,125) → "Video updated".
   - **The target frame is the moment the cover is complete** — the cover in this
     pipeline is the first card, but the hero stat lands a few seconds later (the
     dropshipping episode's "0원" shows up at ~6s, the homepage episode at 6.5s).
     **The picker's first slot (t=0) won't catch the number.** For the timestamp, use
     the moment `produce` pulled `cover.jpg` (the cover transition completion in
     `build-report.txt`).
   - **Don't scrub by eye — read the time the playhead tells you itself.**
     The `content-desc` of the filmstrip's `android.widget.SeekBar` **reports the
     current time in seconds**, in the form
     `Playhead selected at 0 minutes 6 seconds out of 1 minute 25 seconds`
     (found 2026-08-14). Read it after every drag and you hit the target second
     exactly, with no screenshot reading.

     ```bash
     readtime(){ adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
                 adb pull /sdcard/ui.xml .work/ui.xml >/dev/null 2>&1
                 grep -o 'Playhead selected at [^"]*' .work/ui.xml | head -1; }
     adb shell input swipe 81 2240 112 2240 500; sleep 2; readtime   # → 2 seconds
     adb shell input swipe 112 2240 140 2240 500; sleep 2; readtime  # → 5 seconds
     adb shell input swipe 140 2240 156 2240 500; sleep 2; readtime  # → 6 seconds
     ```

     Measured scale (85-second video · filmstrip x 32~1048): t=0 is handle center
     x≈81, and the early stretch runs about **9~15px per second**. Aim for
     x ≈ `81 + (t/total) × 918` to start, then refine with the loop above.
   - **Drag far in one go (60px or more) and the picker dies with
     `Unable to preview the video`, leaving the check unresponsive** — split it into
     drags of about 30px. If it dies, close the editor with X and go back in.
   - Before the check (✓), **confirm with your eyes via screencap that the preview is
     the cover**. Approve the wrong frame here and you get a 200 with the wrong content.
   - Coordinates differ by device and app version — **re-extract them every time with
     `uiautomator dump`**. When the keyboard comes up the buttons all shift (measured:
     pressing NEXT in the email field hit the "." key instead) — don't hammer
     coordinates without checking the screen state.
6. Verdict: `curl -s -o oar.jpg -w "%{http_code}" "https://i.ytimg.com/vi/<videoId>/oardefault.jpg"`
   → **200 = applied**. Download it and confirm the content with your eyes too (200
   means "some" portrait frame is attached, not that it's the "right" one). A size of
   **1080×1920** confirms it's the portrait frame.
   - **It turns 200 right after Save** — measured 2026-08-14, the first query 8 seconds
     after saving returned 200. If 404 keeps coming back, don't wait it out; Save
     didn't take (go back into the editor).
   - `oar1`/`oar2` and the web channel grid serve the old frame for days — **the only
     basis for the verdict is oardefault 200**. Don't redo the work; wait for the cache
     to catch up.
   - After the frame is set, `maxresdefault` turns into a letterboxed version of the
     chosen frame — if the content is the cover that's normal, so don't "fix" it with
     `thumbnails.set`. Upload a landscape-only 16:9 again and **oardefault reverts to
     404** (measured on fect 2026-08-11 — you can't have both, so pick portrait).

## Traps

- **If the guest clock is wrong, the check (✓) tap always dies with
  `Unable to preview the video`** (the state right after a snapshot restore, before
  NTP resyncs). The preview loads fine, which makes it easy to misdiagnose. Run
  `adb shell cmd network_time_update_service force_refresh` →
  `am force-stop com.google.android.youtube` and go back in.
- **After passing through the PIN/lock setup screen, `screencap` comes out fully
  black** (leftover FLAG_SECURE) — `uiautomator dump` still works, so either navigate
  by dump or clear it with one lock (keyevent 26) → unlock (keyevent 224 + swipe +
  PIN) cycle.
- First-run overlays like the notification permission dialog and coach marks intercept
  taps — check with screencap (including a brightness check) or `uiautomator dump` at
  each step before moving on.
- On some runs the Edit screen bounces back to the home screen on the first entry
  after an account switch — going in again from the channel page fixes it.
- **Right after an upload the new video isn't visible in the channel grid and the
  frame picker is unstable** — even when the API says `processingStatus: succeeded`.
  An `am force-stop` and re-entry refreshes the grid, and the picker settles about
  5 minutes after the upload (measured on fect).
- Keep verification screenshots and coordinate measurement logs in the session
  scratchpad, and put the per-videoId oardefault codes in a table in the completion
  report.
