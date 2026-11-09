# Status Bar File Timer

Track cumulative time spent viewing each file in Obsidian's desktop status bar.

Open a file and the timer starts automatically. Switch files and the previous file pauses while the new file resumes its own total. Switching to another application, hiding the window, closing Obsidian, or selecting a non-file view pauses tracking. Only the active file counts, including when multiple panes are visible. Reading counts without typing; this is not an idle or productivity detector. File views such as Markdown, Canvas and PDF are supported.

The status bar shows `▶ 00:12:34` while running and `Ⅱ 00:12:34` while paused. Hover to see the file path. Click the timer (or focus it and press Enter/Space) to pause or resume tracking manually. Manual pause lasts until resumed or the plugin restarts. Use the command palette:

- **Status Bar File Timer: Pause or resume tracking**
- **Status Bar File Timer: Show file time totals** (opens the File time & words pane)

## File time & words pane

Open the pane from the chart ribbon icon or the **Show file time totals** command. It opens as a workspace tab that you can drag into a split or sidebar. Filter by file path and sort by total time, most recently tracked, name, WPM, or words added. Click a file path to open it. The table refreshes every five seconds unless a table control has focus.

Each row has a Reading/Writing selector. Files under a `Clippings` folder default to Reading; other files default to Writing. Changing mode preserves both counters and only changes how future time is classified.

- **Reading WPM (estimate):** current document words / (accumulated reading minutes + historical minutes from before word tracking). Assumes one full read; revisiting a file increases the denominator. This does not detect how many words you actually read.
- **Writing WPM:** sum of positive word-count changes observed while the file is actively tracked / accumulated writing minutes. Existing content is a baseline, deletions do not subtract, and pasted text and retyping count as additions. Time spent thinking also counts.
- Word counts apply to Markdown, exclude frontmatter, fenced code, images and link URLs, and use Unicode letter/number groups. This is an approximate prose count, not a language-specific tokenizer. Other file formats show a dash for word statistics.
- Rates display after at least one second of the corresponding mode's time. Very short samples can produce large WPM values.
- Version 1.0 time totals are preserved. Version 1.1.1 backfills reading WPM using that historical time and the current document word count, labeled **Backfilled** in the table. This assumes historical time was reading, and also applies when you change an older file to Reading. Previously recorded writing time is excluded. Writing WPM still uses only observed additions and writing time since version 1.1; historical words written and last-tracked dates cannot be reconstructed. Backfilling never changes total time or invents words added.

## Install locally

1. Run `npm ci` and `npm run check` in this directory (Node.js 22 or newer).
2. Create `<vault>/.obsidian/plugins/statusbar-file-timer/` (use your vault's configured settings folder if different).
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian. In **Settings → Community plugins**, enable community plugins and **Status Bar File Timer**.

The compiled `main.js` is already present after the initial build. This plugin is desktop-only because its UI is the desktop status bar. It has not yet been published in Community Plugins.

## Data and timing

Totals are stored as milliseconds by vault-relative file path in the plugin's `data.json`, with a one-second display tick. No note contents or frontmatter are changed. No analytics or network requests are made. Files and folders renamed through Obsidian keep their totals; deleting a file/folder removes its totals. External renames while Obsidian is closed cannot be associated with the original path.

Only totals are saved, never a running timestamp. Saves occur every five seconds, on file/focus changes, and on unload. Sudden process termination may lose the most recent unsaved seconds; the final asynchronous save during app shutdown is best effort. Timer gaps longer than 2.5 seconds are discarded to avoid counting sleep or suspended rendering; this can undercount during a long UI stall. A fully obscured but still focused window cannot reliably be distinguished from a visible window by browser APIs. Totals belong to this vault/plugin installation, with no concurrent multi-device merge logic; avoid syncing `data.json` between simultaneously running clients.

## Development

- `npm run dev`: watch and rebuild JavaScript.
- `npm run check`: run timing tests, TypeScript checking, and production build.
- `npm run build`: type-check and build `main.js`.

The timer engine in `src/timer.ts` is independent of Obsidian. `src/main.ts` handles workspace/window events, status bar, persistence, and the statistics pane. Minimum API target: Obsidian 1.8.7. Actual UI compatibility needs the checks below before publishing.

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
10. Use the status-bar keyboard control and command palette; check the totals modal and theme contrast.

Automated tests and build pass. The plugin has also been installed in a live desktop vault and its status bar verified; the complete manual acceptance checklist remains to be performed.

## Publishing

See [PUBLISHING.md](PUBLISHING.md) for release preparation and the current Community directory submission process.

## Reference

[Status Bar Pomo](https://github.com/kzhovn/statusbar-pomo-obsidian) was consulted for its status-bar and command-palette interaction patterns. This is an independently written plugin; the reference repository was neither forked nor cloned, and its source was not copied.

## License

MIT; see [LICENSE](LICENSE).
