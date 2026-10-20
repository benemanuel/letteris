// Entry-point detection that works on Windows.
//
// `import.meta.url === \`file://${process.argv[1]}\`` is the usual idiom and it
// silently fails here: argv[1] is a backslash path (C:\...\x.js) while
// import.meta.url is a URL (file:///C:/.../x.js), so the script imports fine
// and then does nothing at all.

import { pathToFileURL } from 'node:url';

export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  return importMetaUrl === pathToFileURL(process.argv[1]).href;
}

/** Run `fn` when the module is the entry point, reporting failures sanely. */
export function runMain(importMetaUrl, fn) {
  if (!isMain(importMetaUrl)) return;
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      console.error(err && err.stack ? err.stack : String(err));
      process.exit(1);
    });
}

/** Minimal flag parsing shared by the phase scripts. */
export function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags.add(name);
    else {
      values[name] = next;
      i += 1;
    }
  }
  return {
    has: (n) => flags.has(n) || n in values,
    str: (n, d = null) => (n in values ? values[n] : d),
    num: (n, d = null) => (n in values ? Number(values[n]) : d),
  };
}
