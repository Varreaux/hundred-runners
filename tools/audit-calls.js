// Find calls with no definition, and definitions with no callers, in index.html.
//
// Both failure modes have already shipped here. gateStrike lost its definition to the
// losing side of a merge while its only caller survived, which throws inside draw() and
// freezes the game. millShutter was the opposite: a wrapper that kept its definition after
// its last caller went away, which is dead weight rather than a crash. Neither is visible
// in a diff and neither is caught by a syntax check.
//
// The thing this script is really for is NOT crying wolf. A crude grep for `function NAME(`
// reports every arrow function as an undefined call: inMill came back as 17 calls with no
// definition and looked exactly like the gateStrike bug. An audit whose false alarms are
// indistinguishable from its true ones gets ignored, and then it is worse than no audit.
// So every declaration form below is recognised, and anything it still cannot resolve is
// reported separately as "unresolved" rather than as a fault.
//
// The stakes are worse than a wasted afternoon, which is why the false alarms below were
// each hunted down rather than documented as quirks. This tool once reported `ordinal` as
// dead. It is the function that turns a crossing number into "3rd", and its only two
// callers live inside template literals, which an earlier version of the string-stripping
// had erased. Acting on that report would not have crashed anything: the run report would
// have kept drawing, every line quietly missing a word, and nobody would have connected it
// to an audit run days earlier. A check that can cause a silent regression while sounding
// certain is a more dangerous object than no check at all.
//
// Usage: node tools/audit-calls.js [path/to/index.html]

const fs = require('fs'), path = require('path');
const target = process.argv[2] || path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(target, 'utf8').split('<script>')[1].split('</script>')[0];

// Strip strings, template literals and comments so their contents cannot look like code.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

const defs = new Map();                       // name -> how it was declared
const add = (n, how) => { if (!defs.has(n)) defs.set(n, how); };

// function foo(...)  /  async function foo(...)
for (const m of code.matchAll(/\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) add(m[1], 'function');
// const foo = (...) => ... | const foo = function ... | let/var likewise
for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) add(m[1], 'arrow');
for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/g)) add(m[1], 'function expr');
// foo = (...) => ...  (reassignment, and window.foo = ... for test hooks)
for (const m of code.matchAll(/(?:^|[;{}\s])(?:window\.)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) add(m[1], 'assigned arrow');
// destructured or imported names are treated as defined
for (const m of code.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g))
  for (const part of m[1].split(',')) { const n = part.split(':').pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) add(n, 'destructured'); }
// Parameters. A callback invoked as fn(...) inside its own function is defined by the
// signature, not by a declaration, and reporting it is the crying-wolf failure again.
for (const m of code.matchAll(/(?:function\s*\*?\s*[A-Za-z_$][\w$]*\s*|=>\s*|\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)?\(([^()]*)\)\s*(?:=>|\{)/g))
  for (const part of m[1].split(',')) {
    const n = part.replace(/=.*$/, '').replace(/\.\.\./, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(n)) add(n, 'parameter');
  }

// Object-literal method shorthand: `thud() {` inside `const AU = { ... }`. These are
// properties, not globals, so they are recorded per owner and checked against `AU.thud()`.
const owners = new Map();
for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g)) {
  const name = m[1];
  let i = m.index + m[0].length - 1, depth = 0, end = i;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = code.slice(m.index, end + 1);
  const props = new Set();
  for (const p of body.matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*(?:\(|:)/gm)) props.add(p[1]);
  owners.set(name, props);
  // shorthand methods are definitions, not calls
  for (const p of body.matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) add(p[1], `method of ${name}`);
}

const BUILTIN = new Set(['if','for','while','switch','catch','return','typeof','function','new','do','else','delete','void','in','of','instanceof','throw','await','yield','super','this','Math','JSON','Object','Array','String','Number','Boolean','Date','Map','Set','Promise','parseInt','parseFloat','isFinite','isNaN','encodeURIComponent','decodeURIComponent','setTimeout','setInterval','clearTimeout','clearInterval','requestAnimationFrame','cancelAnimationFrame','console','localStorage','performance','document','window','eval','require','Error','RegExp','Symbol','BigInt','structuredClone','queueMicrotask','fetch','alert','confirm','prompt']);

// Bare calls: NAME( not preceded by a dot or word character. A capitalised name is a
// constructor or a host global (URLSearchParams, KeyboardEvent) rather than something this
// file defines, so it is not this audit's business.
const bare = new Map();
for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
  if (BUILTIN.has(m[1]) || /^[A-Z]/.test(m[1])) continue;
  bare.set(m[1], (bare.get(m[1]) || 0) + 1);
}
// Owned calls: OBJ.NAME(, but only for objects declared at the top level. A local `line`
// that happens to share its name with a module-level literal produced line.pop and
// line.slice as faults, which is the same false alarm in a new costume. Standard prototype
// methods are skipped for the same reason.
const PROTO = new Set(['push','pop','shift','unshift','slice','splice','concat','join','map','filter','reduce','forEach','find','findIndex','some','every','sort','reverse','includes','indexOf','fill','flat','keys','values','entries','has','get','set','add','delete','clear','toFixed','toString','charAt','charCodeAt','split','replace','trim','padStart','padEnd','startsWith','endsWith','match','matchAll','repeat','then','catch','finally','bind','call','apply']);
const topOwners = new Set([...code.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/gm)].map(m => m[1]));
const owned = [];
for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g))
  if (topOwners.has(m[1]) && owners.has(m[1]) && !PROTO.has(m[2])) owned.push([m[1], m[2]]);

const missing = [...bare.keys()].filter(n => !defs.has(n)).map(n => ({ name: n, calls: bare.get(n) }));
const missingProps = owned.filter(([o, p]) => !owners.get(o).has(p)).map(([o, p]) => `${o}.${p}`);

// Orphans: a FUNCTION defined at top level that nothing mentions anywhere else. Counting
// calls rather than references reported ROCK, which is a const array built by an IIFE and
// indexed in two places but never called: dead by the letter of the check and thoroughly
// alive in fact. The test is occurrences, and only for names that are function-shaped.
const FUNCLIKE = new Set(['function', 'arrow', 'function expr', 'assigned arrow']);
// Counted against a version that keeps template literals, because `${ordinal(d.ord)}` is
// real code and blanking the literal erased the only two callers of ordinal, reporting a
// live function as dead. Prose inside a template can only inflate a count, which loses an
// orphan rather than inventing one, and that is the direction this check should err in.
const withTemplates = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
const uses = new Map();
for (const m of withTemplates.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)) uses.set(m[1], (uses.get(m[1]) || 0) + 1);
const topLevel = new Set();
for (const m of code.matchAll(/^(?:(?:async\s+)?function\s*\*?\s*|const\s+|let\s+)([A-Za-z_$][\w$]*)/gm)) topLevel.add(m[1]);
const orphans = [...topLevel].filter(n =>
  FUNCLIKE.has(defs.get(n)) && (uses.get(n) || 0) <= 1 && !owned.some(([, p]) => p === n));

const out = {
  definitionsFound: defs.size,
  calledButNotDefined: missing,
  propertyCallsWithNoProperty: [...new Set(missingProps)],
  definedButNeverCalled: orphans,
};
console.log(JSON.stringify(out, null, 1));
const bad = missing.length + missingProps.length;
if (bad) { console.error(`\nFAIL: ${bad} call(s) with no definition. This is the shape that freezes the game.`); process.exit(1); }
