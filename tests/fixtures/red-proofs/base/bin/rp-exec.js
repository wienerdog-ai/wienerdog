#!/usr/bin/env node
'use strict';
// A tracked EXECUTABLE fixture (mode 0755), so the snapshot manifest's mode
// bits have a subject in this tree. Nothing runs it.
process.stdout.write('rp-exec\n');
