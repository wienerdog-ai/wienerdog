---
date: 2026-07-04
title: First-production-night incident
related_wps: [WP-038, WP-039, WP-040, WP-041]
---

# First-production-night incident (2026-07-04)

**First-production-night incident (2026-07-04).** WP-038, WP-039 and WP-041 form
a serial chain (they edit the shared `run-job.js` / `dream.js` / `validate.js`
cluster); WP-040 branches off the dream skill independently. Together they close
the six gaps the first scheduled dream exposed: clean-env PATH/USER (WP-038),
log-rotation evidence loss (WP-038), brain-stderr surfacing (WP-038 captures +
WP-039 surfaces), dirty-vault starvation and crashed-brain self-starvation
(WP-039), transient failure visibility (WP-041), and note-update provenance loss
(WP-040).
