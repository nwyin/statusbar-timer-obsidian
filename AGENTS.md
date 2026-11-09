# Repository guidance

## Temporary tests only

You may write and run temporary tests while implementing a change to verify correct behavior. Tests must not persist in this repository or in the working session after verification is finished.

- Prefer inline checks or a temporary directory outside the repository.
- Remove all temporary test files, fixtures, scripts, reports, screenshots, and other test artifacts when finished, including after failed checks.
- Clean up test notes and other temporary changes made in Obsidian. Preserve user data.
- Do not commit tests, test suites, test-only dependencies, or test-runner configuration. Do not retain tests for future sessions.
- Keep the normal build and TypeScript checks. Run `npm run check` before completing implementation changes.
