# Publish to Obsidian Community Plugins

Process verified against official documentation on 9 November 2026. The current submission route is the Obsidian Community directory. Older tutorials describing a pull request to `obsidian-releases` are not the current instructions.

## Prepare

1. Run the manual acceptance checks in README.md on desktop, including pop-out windows and quit/reopen behavior. Verify the minimum supported Obsidian version and adjust `minAppVersion` and `versions.json` if necessary.
2. Confirm the public author name (currently `tau`) in `manifest.json` and LICENSE. Optionally add `authorUrl`.
3. Verify `statusbar-file-timer` is available in the Community directory. Plugin IDs must be unique and cannot contain `obsidian`. The repository name `statusbar-timer-obsidian` is fine. If changing the ID, also update the README install folder.
4. Push this project's source, lockfile, README, LICENSE, manifest, versions file and workflows to [nwyin/statusbar-timer-obsidian](https://github.com/nwyin/statusbar-timer-obsidian). Do not upload `node_modules` or your vault's `data.json`. This does not require forking or cloning the reference repository.
5. Review the [developer policies](https://docs.obsidian.md/Developer%20policies) and [plugin submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins).

## Release

The included GitHub Actions release workflow runs checks, builds, and creates a **draft** release when you push a version tag such as `1.1.0`. It verifies that the tag matches `manifest.json`. No `v` prefix. Review the draft and publish it when ready.

Alternatively, after `npm ci && npm run check`, create a GitHub release manually using tag `1.1.0` and attach these three files individually:

- `main.js`
- `manifest.json`
- `styles.css`

A source-code archive alone is insufficient. The manifest version on the default branch must match the release tag. Keep package.json, package-lock.json, manifest.json, and versions.json consistent for subsequent versions.

Suggested first release description:

> Track cumulative focused viewing time for each file in the desktop status bar. Automatically pause on file changes and app focus loss. Includes saved totals, manual pause/resume, and a file totals view. All tracking data stays in the vault's plugin data file.

## Submit

1. Sign in at [community.obsidian.md](https://community.obsidian.md) with your Obsidian account.
2. Link your GitHub account so repository ownership can be verified.
3. Add the plugin using its public GitHub repository URL. The directory reads the manifest from the default branch.
4. Address automated review feedback with source fixes and a new versioned release as needed. Review the listing description and publish through the directory. The plugin becomes installable once review requirements are satisfied.

Only the initial listing requires submission. Later releases are distributed through GitHub. No listing or release has been published by this local project setup; repository ownership and account linking remain with the publisher.

Official references:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim)
- [Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
