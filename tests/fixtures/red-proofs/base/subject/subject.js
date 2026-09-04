'use strict';
// THE MUTABLE SUBJECT. Every fixture declaration's `file` is this module: it is
// the condition the fixture suites' assertions observe, and it is never the
// suite that hosts them.
const greeting = 'hello';
const arity = 2;
const shared = 'shared-ok';
module.exports = { greeting, arity, shared };
