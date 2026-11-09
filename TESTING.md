# Verification record — 1.2.0

Checked on 9 November 2026:

- Clean `npm ci` followed by `npm run check`: 33 automated tests passed; TypeScript and esbuild passed. `npm ls @codemirror/view` reported a valid dependency tree.
- Runtime bundle imports only the Obsidian and CodeMirror host APIs. No Node, Electron, native filesystem or network APIs are used by the plugin.
- Live desktop upgrade: compared all migrated legacy time/mode/word-addition fields to a pre-upgrade backup. Values matched; later viewing time was recorded separately in new sessions. Reload preserved the combined data.
- Live vault receive path: adding an independent Markdown session file updated totals without reload; adding a conflict copy did not double-count; a later revision increased totals once. Temporary test notes and incoming test files were removed.
- Obsidian mobile emulation at 390×844 CSS pixels: plugin loaded without a status bar; table rows became cards; inputs/selects/buttons were at least 44px tall; no horizontal overflow. Filtering and pause/resume controls worked.
- Mobile-emulated Markdown editor: initial content added zero words; an input transaction adding three words added exactly three. Synthetic pagehide paused timing, pageshow resumed eligibility, manual pause excluded time and edits, and resume restarted timing. This test caught and fixed an initial-load word-count bug by switching writing measurement to CodeMirror input-event transactions.
- Returned the app to desktop mode and confirmed the status bar and statistics pane loaded. Reserved timer data files were not themselves tracked.

## Still requiring physical devices

No Android device was attached to ADB and no booted iOS simulator was available. Android WebView and iOS WKWebView background/foreground, screen-lock, OS termination, software-keyboard behavior and a real two-device Obsidian Sync roundtrip have **not** been verified. Synthetic lifecycle events and desktop emulation are not substitutes for these checks.

Run the per-device checklist in [SYNC.md](SYNC.md) and record the device/OS/Obsidian version and results before treating this as hardware-tested mobile support. Desktop-side Obsidian Sync can report that files are uploaded, but that alone does not prove that a phone has received or loaded them.
