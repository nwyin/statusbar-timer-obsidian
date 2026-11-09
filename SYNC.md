# Mobile and shared vault data

## Android and iOS

Version 1.3 supports the mobile API surface: it uses Obsidian's Vault API and browser APIs, with no Node, Electron or direct filesystem dependencies. The desktop status bar is optional. On a phone, open **File time & words** from the ribbon or **Status Bar File Timer: Show file time totals** in the command palette. The pane has a Pause/Resume button; the same action is available as a command you can add to your mobile toolbar. On narrow screens each table row becomes a compact card.

Only the active file counts. Android/iOS use document visibility and page lifecycle events instead of desktop window focus (software keyboards can change focus). Hidden/suspended pages pause; timing gaps longer than 2.5 seconds are discarded. The plugin does not request background execution. A device whose OS kills the webview can lose up to five seconds since the local checkpoint; recovery waits until the app next opens.

Mobile emulation checks the UI and plugin loading, not native WebKit/Android lifecycle behavior. Before relying on the numbers on a new device, run the hardware checks below.

## Set up with Obsidian Sync

1. Upgrade the desktop plugin first. Wait for the `File Timer/sessions/` folder to appear and for Obsidian Sync to finish uploading it. Old timing data is imported automatically; the original note contents are untouched.
2. Connect the mobile app to the same remote vault and let notes and the `File Timer/` folder finish downloading. Do not exclude that folder. These are normal `.md` files, so **Sync all other types** is not needed for timer data.
3. In Sync settings, enable **Installed community plugin list** and **Active community plugin list** if you want Obsidian to distribute/enable the plugin. Reload the receiving app after plugin files arrive, and confirm the plugin version is 1.3.0 or newer. If installing manually, copy `main.js`, `manifest.json`, and `styles.css` into the plugin folder, then enable it.
4. Open **File time & words**. Both devices should show matching totals after sync. The command **Save and refresh shared timer data** flushes this device's counters and rereads local files; Obsidian Sync still controls network delivery.
5. You can now work offline. Each device writes its own session file; when sync resumes, their contributions combine automatically.

Sync preferences are device-specific. Don't run an older timer plugin against the shared data: pre-1.2 versions only write the old `data.json` and do not participate in this protocol. Stop tracking on the old version before upgrading.

Official references: [Obsidian Sync settings](https://help.obsidian.md/sync/settings), [mobile plugin development](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development).

## Portable plaintext format

```
Your vault/
  File Timer/
    sessions/
      legacy-<random-id>.md
      <session-id>.md
      <another-session-id>.md
```

The session files are Markdown with a fenced JSON payload. An abbreviated example:

```json
{
  "format": "statusbar-file-timer",
  "version": 1,
  "kind": "session",
  "id": "a-random-session-id",
  "revision": 12,
  "entries": [{
    "id": "a-random-session-id:a-random-entry-id",
    "path": "Clippings/Example.md",
    "readingMs": 60000,
    "writingMs": 0,
    "historicalMs": 0,
    "added": 0,
    "lastTracked": 1794225600000,
    "words": 300,
    "wordsAt": 1794225600000,
    "mode": "reading",
    "modeAt": 0
  }],
  "changes": []
}
```

- Durations are integer milliseconds; timestamps are Unix milliseconds. `added` is observed positive word-count change, not document word count. `words` can be null when unsupported/unknown.
- Each plugin load gets a random session ID. Only that running session updates its file; after it closes, the file is read-only history. No device identifier is copied from synced plugin settings.
- Time and added-word counters only increase. Replayed revisions and conflict copies of the same entry merge by maxima, not addition. Distinct entry IDs add together. Reading/writing mode and word-count metadata use timestamp ordering, with deterministic ID tie-breaking.
- Optional `paused` (boolean) and `pausedAt` (timestamp) fields store per-file pause preferences. Missing fields mean tracking is enabled. The latest explicit choice wins; the preference follows known contribution IDs through renames. Upgrade every device to 1.3.0 to honor pauses; older versions ignore this metadata.
- Current document word counts are not added across devices. The pane counts locally available Markdown content; reading WPM uses combined reading time, and writing WPM uses combined observed additions/writing time.
- Rename/delete changes target contribution IDs. Renames keep time; deletions tombstone those known contributions so old snapshots cannot resurrect them. Notes missing from this device's vault are hidden from its table, while their shared history is retained.
- The `File Timer/` directory is reserved and excluded from tracking, so reading the ledger cannot create more tracking data.
- Plugin `data.json` contains only a storage-version marker after migration. It is not the shared statistics database. A vault-scoped, device-local Web Storage checkpoint is saved every five seconds for crash recovery. It is not synced. Session files flush every 30 seconds and on file/focus/lifecycle changes; unchanged content is not rewritten.

To back up or share, copy `File Timer/` along with the notes. There is no server, account, or proprietary database for timer data. Other tools can parse the JSON blocks. The files contain note paths, reading/writing times, word counts and timestamps; anyone with access to the shared vault can see these. They do not contain note bodies or keystrokes.

## Migration and limitations

Existing pre-1.2 totals, modes, words added and WPM history migrate into a legacy session file. Stable legacy entry IDs deduplicate mirrored imports; differing legacy copies use counter maxima instead of summing potentially overlapping history. If old devices independently accumulated data before upgrading, there is no reliable way to distinguish overlapping history from independent time. Upgrade the authoritative desktop first and sync it before enabling the plugin elsewhere.

Concurrent sessions on two visible devices count separately, even for the same note. This measures device viewing time, not unique human attention. Device clocks should be approximately correct for "last tracked" and metadata ordering; counter merging does not rely on synchronized clocks.

Rename/delete operations cover contributions known to the device at that moment. Synchronize before moving/deleting files across devices. An unseen, newly created offline contribution to the old path cannot be reliably associated with a later rename; it remains in the ledger but is hidden if its old note path is absent. Renames performed while all plugin instances are closed also cannot be inferred. No frontmatter IDs are added to notes.

Don't hand-edit or rename session files or the reserved folder while tracking. Malformed/future-schema files are left untouched and reported. Last valid in-memory data is retained during partial writes. If storage is full, a notice appears and pending local data is retried; a local checkpoint is not a replacement for backups. Deleting session files discards their history; disable the plugin on all devices before intentionally resetting data. No automatic compaction is performed: there is roughly one file per plugin load, plus a one-time migration file.

## Android/iOS acceptance checks

On each actual device, with the same synced vault:

1. Open a Markdown note for 10 seconds. Open the timer pane: its total should increase by about 10 seconds.
2. Background Obsidian for 20 seconds, return, then lock/unlock for 20 seconds. Neither interval should be added.
3. Show/hide the software keyboard and type five new words; confirm tracking resumes normally and writing additions increase by five. Paste and deletion behavior should match the README.
4. Pause file A from the pane or command, then open B: B must track by default. Return to A and restart the plugin: A must stay paused until resumed. Confirm paused time and edits do not count.
5. Force-close/reopen the app. Totals should survive (up to five seconds may be lost), with no closed time added.
6. Let both devices sync, take them offline, and view a note on each. Reconnect, wait for sync, and refresh the pane. Each device should show the sum, with no doubling when restarted.
7. Move a file after both devices are synced. Confirm its history follows on both. Test with a disposable note.
8. Check portrait/landscape, small text/large text, tap targets, sorting, filtering, and light/dark themes.

Automated tests cover merge semantics, migration, crash-checkpoint replay, partial writes, and activity gating. Real Android/iOS acceptance results must be recorded separately; desktop emulation does not certify these hardware checks.
