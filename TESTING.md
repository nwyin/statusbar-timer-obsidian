# Verification record — 1.2.0

Checked on 9 November 2026:

- Clean `npm ci` followed by `npm run check`: 33 automated tests passed; TypeScript and esbuild passed. `npm ls @codemirror/view` reported a valid dependency tree.
- Runtime bundle imports only the Obsidian and CodeMirror host APIs. No Node, Electron, native filesystem or network APIs are used by the plugin.
- Live desktop upgrade: compared all migrated legacy time/mode/word-addition fields to a pre-upgrade backup. Values matched; later viewing time was recorded separately in new sessions. Reload preserved the combined data.
- Live vault receive path: adding an independent Markdown session file updated totals without reload; adding a conflict copy did not double-count; a later revision increased totals once. Temporary test notes and incoming test files were removed.
- Obsidian mobile emulation at 390×844 CSS pixels: plugin loaded without a status bar; table rows became cards; inputs/selects/buttons were at least 44px tall; no horizontal overflow. Filtering and pause/resume controls worked.
- Mobile-emulated Markdown editor: initial content added zero words; an input transaction adding three words added exactly three. Synthetic pagehide paused timing, pageshow resumed eligibility, manual pause excluded time and edits, and resume restarted timing. This test caught and fixed an initial-load word-count bug by switching writing measurement to CodeMirror input-event transactions.
- Returned the app to desktop mode and confirmed the status bar and statistics pane loaded. Reserved timer data files were not themselves tracked.

## User device confirmation

On 9 November 2026, after volunteering to test Android and iOS and receiving the mobile installation/sync instructions, the user reported that it works and requested that the changes be synced to GitHub. This is user-reported functional confirmation; device models, OS/Obsidian versions and individual checklist results were not supplied.

No physical device was directly inspected by the coding agent. Keep the per-device checklist in [SYNC.md](SYNC.md) for future regression testing, especially native background/foreground, screen-lock, OS termination and software-keyboard behavior. Desktop emulation and synthetic lifecycle events alone do not establish those native behaviors.
