# Runbook: release

Pre-1.0, releases are manual until release-please lands (M7). Until then:

1. All merged WPs for the release are in `docs/specs/done/` with status Done.
2. `npm test && npm run lint` green on main; CI green.
3. Bump version in package.json (SemVer; stay 0.x until the installed file layout is stable — ADR-0003).
4. Update CHANGELOG.md from merged PR titles (conventional commits).
5. `npm publish --provenance --access public` (requires npm account with `wienerdog` ownership).
6. Tag `v<version>`, GitHub release with the changelog section.
7. Post-release: weekly smoke workflow (`smoke.yml`, M7) verifies published-package install on a clean runner.
