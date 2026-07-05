# Runbook: release

Pre-1.0, releases are manual until release-please lands (M7). Until then:

1. All merged WPs for the release are in `docs/specs/done/` with status Done.
2. `npm test && npm run lint` green on main; CI green.
3. Bump version in package.json (SemVer; stay 0.x until the installed file layout is stable — ADR-0003).
4. Update CHANGELOG.md from merged PR titles (conventional commits).
5. Commit the bump (`chore(release): <version>`). **Publish from a tagged/release commit, never bare `main`.** `main` runs ahead of the last release (unreleased WPs merge continuously without a version bump), so `npm publish` from `main` ships unreleased code under the current version number. Cut the release, `git tag v<version>` at that commit, then publish with `HEAD` on the tag (`git checkout v<version>`) — verified 2026-07-05 after a near-miss where the 0.4.0 chain would have shipped mislabeled as 0.3.1. `main`'s `package.json` version tracks the *next* target (the code on `main`), not the last release.
6. `npm publish --access public` (requires npm account with `wienerdog` ownership + 2FA; a **granular read+write token** scoped to the package, or the interactive browser 2FA flow — classic Publish tokens do NOT satisfy passkey 2FA and 404 on PUT). NOTE: `--provenance` only works from CI with OIDC (GitHub Actions), not from a local machine — add it when releases move to CI.
7. After publishing: `npm view wienerdog@<version> dist.tarball | xargs curl -s | tar -tz` and confirm the file list matches the intended release (no unreleased modules leaked in).
8. Tag `v<version>` (if not already), GitHub release with the changelog section.
9. Post-release: weekly smoke workflow (`smoke.yml`, M7) verifies published-package install on a clean runner.
