# Runbook: issue triage

(Activates when the repo goes public.)

- **bug**: reproduce with `doctor` output; if the installer touched something outside its manifest, label `security` and treat as P0 (see SECURITY.md scope).
- **feature**: check against ADR-0004 first — anything requiring a daemon/server gets a polite decline citing the ADR. Otherwise label and leave for weekly review.
- **wp-proposal**: route to wd-architect for spec-worthiness; answer within a week.
- **dogfood**: friction found while developing Wienerdog with Wienerdog — reviewed weekly by the architect, feeds the roadmap with priority.
- Questions → GitHub Discussions, keep Issues for work.
- Growth trigger (from the plan): >~10 external issues/week sustained → stand up the wd-pm agent and hand this runbook to it.
