# Status Bar File Timer

Track cumulative focused time and reading/writing speed on desktop, Android and iOS. Use the desktop status bar or the mobile-friendly File time & words pane.

Open a file and the timer starts automatically. Switch files and the previous file pauses while the new file resumes its own total. Switching to another application, hiding the window, closing Obsidian, or selecting a non-file view pauses tracking. Only the active file counts, including when multiple panes are visible. Reading counts without typing; this is not an idle or productivity detector. File views such as Markdown, Canvas and PDF are supported.

The status bar shows `▶ 00:12:34` while running and `Ⅱ 00:12:34` while paused. Hover to see the file path. Click the timer (or focus it and press Enter/Space) to pause or resume tracking manually. Pause applies only to that file and persists across restarts and synced devices. New files track automatically. The statistics pane has Pause/Resume controls for each file; its top button controls the most recently viewed file and shows its path. Pausing excludes both time and writing additions without resetting existing totals. Use the command palette:

- **Status Bar File Timer: Pause or resume tracking for this file**
- **Status Bar File Timer: Show file time totals** (opens the File time & words pane)
- **Status Bar File Timer: Save and refresh shared timer data**

## File time & words pane

Open the pane from the chart ribbon icon or the **Show file time totals** command. It opens as a workspace tab that you can drag into a split or sidebar. Filter by file path and sort by total time, most recently tracked, name, WPM, or words added. Click a file path to open it. The table refreshes every five seconds unless a table control has focus.

Each row has a Reading/Writing selector. Files under a `Clippings` folder default to Reading; other files default to Writing. Changing mode preserves both counters and only changes how future time is classified.

- **Reading WPM (estimate):** current document words / (accumulated reading minutes + historical minutes from before word tracking). Assumes one full read; revisiting a file increases the denominator. This does not detect how many words you actually read.
- **Writing WPM:** sum of positive word-count changes from editor input events while the file is actively tracked / accumulated writing minutes. Initial loads, programmatic replacements, and synced content are excluded; deletions do not subtract, and pasted text, redo and retyping count as additions. Time spent thinking also counts.
- Word counts apply to Markdown, exclude frontmatter, fenced code, images and link URLs, and use Unicode letter/number groups. This is an approximate prose count, not a language-specific tokenizer. Other file formats show a dash for word statistics.
- Rates display after at least one second of the corresponding mode's time. Very short samples can produce large WPM values.
- Version 1.0 time totals are preserved. Version 1.1.1 backfills reading WPM using that historical time and the current document word count. This assumes historical time was reading, and also applies when you change an older file to Reading. Previously recorded writing time is excluded. Writing WPM still uses only observed additions and writing time since version 1.1; historical words written and last-tracked dates cannot be reconstructed. Backfilling never changes total time or invents words added.

## Install locally

1. Run `npm ci` and `npm run check` in this directory (Node.js 22 or newer).
2. Create `<vault>/.obsidian/plugins/statusbar-file-timer/` (use your vault's configured settings folder if different).
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian. In **Settings → Community plugins**, enable community plugins and **Status Bar File Timer**.

The compiled `main.js` is present after building. The plugin supports desktop and the mobile API surface; see [mobile setup, sync format and hardware checks](SYNC.md). It has not yet been published in Community Plugins.

## Data and timing

Totals are stored in ordinary Markdown files under `File Timer/sessions/`, with JSON payloads describing each session's contributions. Each app session writes a separate file; repeated deliveries are deduplicated, and independent device contributions combine. Existing plugin data migrates automatically. No note contents or frontmatter are changed, and no network requests or analytics are made by the plugin.

Use Obsidian Sync to sync the whole `File Timer/` folder alongside the notes. Local crash checkpoints save every five seconds; session files flush every 30 seconds and on file/focus/lifecycle changes. Gaps longer than 2.5 seconds are discarded to avoid counting sleep. A fully obscured but still focused desktop window cannot reliably be distinguished from a visible one.

See [SYNC.md](SYNC.md) for the plaintext schema, setup steps, migration behavior, privacy, rename limitations, and Android/iOS acceptance checks. On phones, use the pane's Pause/Resume button or the command palette; no desktop status bar is required.

## Development

- `npm run dev`: watch and rebuild JavaScript.
- `npm run check`: run timing tests, TypeScript checking, and production build.
- `npm run build`: type-check and build `main.js`.

The timer engine in `src/timer.ts`, merge model in `src/ledger.ts`, sync I/O coordinator in `src/sync.ts`, and activity policy in `src/activity.ts` are independently testable. `src/main.ts` handles workspace/window events, status bar, persistence, and the statistics pane. Minimum API target: Obsidian 1.8.7. Actual UI compatibility needs the checks below before publishing.

## Manual acceptance checks

Use a disposable test vault before a public release:

1. Open A for ten seconds: its total increases approximately ten seconds.
2. Switch to B for five seconds, then return to A: A resumes its saved total.
3. Split A/B side by side: only the active pane's file increases. Repeat with a pop-out window.
4. Switch apps or minimize for ten seconds: return and confirm no background time was added.
5. Pause from the status bar, wait, switch files, and resume: no paused time is added.
6. Quit/reopen the app and disable/re-enable the plugin: saved totals survive, with no closed time added.
7. Sleep/wake the computer: the sleep interval is excluded.
8. Rename a file and then its folder: totals follow both. Delete it: it disappears from totals.
9. Open a non-file tab: tracking pauses. Verify PDF, Canvas, reading and editing views.
10. Use the status-bar keyboard control and command palette; check the statistics pane and theme contrast.

Automated tests and build pass. Desktop loading, exact migration, live session-file ingestion and deduplication, and mobile emulation at 390px have been checked. Mobile emulation also verified typing, pause/resume, and synthetic pagehide/pageshow handling. The user subsequently confirmed that the mobile installation/sync works. Specific device versions and individual native lifecycle results were not recorded; see TESTING.md and the regression checklist in SYNC.md.

## Publishing

See [PUBLISHING.md](PUBLISHING.md) for release preparation and the current Community directory submission process.

## Reference

[Status Bar Pomo](https://github.com/kzhovn/statusbar-pomo-obsidian) was consulted for its status-bar and command-palette interaction patterns. This is an independently written plugin; the reference repository was neither forked nor cloned, and its source was not copied.

## License

MIT; see [LICENSE](LICENSE).
