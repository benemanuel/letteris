// Where each Hebrew combining mark sits relative to its letter.
//
// This is the table the whole mapping rests on: given a word from the corpus,
// it says how many marks should appear above the letters and how many below,
// which is what a scanned line can actually be checked against. It is a fixed
// property of each codepoint, not something to be inferred.
//
// Two entries are worth calling out because they are easy to get wrong, and
// getting them wrong would silently shift every count on a line:
//
//   U+05A0 is TELISHA GEDOLA and U+05A9 is TELISHA QETANA - the numbers are not
//   in the order the names suggest, and both sit above.
//   U+05BC DAGESH sits *inside* the letter, so it is neither an above nor a
//   below mark and must not be counted as one.

export const ABOVE = 'above';
export const BELOW = 'below';
export const INSIDE = 'inside';

/** codepoint -> { name, zone } */
export const MARKS = new Map(Object.entries({
  // cantillation, U+0591..U+05AF
  0x0591: ['etnahta', BELOW],
  0x0592: ['segol-accent', ABOVE],
  0x0593: ['shalshelet', ABOVE],
  0x0594: ['zaqef-qatan', ABOVE],
  0x0595: ['zaqef-gadol', ABOVE],
  0x0596: ['tipeha', BELOW],
  0x0597: ['revia', ABOVE],
  0x0598: ['zarqa', ABOVE],
  0x0599: ['pashta', ABOVE],
  0x059a: ['yetiv', BELOW],
  0x059b: ['tevir', BELOW],
  0x059c: ['geresh', ABOVE],
  0x059d: ['geresh-muqdam', ABOVE],
  0x059e: ['gershayim', ABOVE],
  0x059f: ['qarney-para', ABOVE],
  0x05a0: ['telisha-gedola', ABOVE],
  0x05a1: ['pazer', ABOVE],
  0x05a2: ['atnah-hafukh', BELOW],
  0x05a3: ['munah', BELOW],
  0x05a4: ['mahapakh', BELOW],
  0x05a5: ['merkha', BELOW],
  0x05a6: ['merkha-kefula', BELOW],
  0x05a7: ['darga', BELOW],
  0x05a8: ['qadma', ABOVE],
  0x05a9: ['telisha-qetana', ABOVE],
  0x05aa: ['yerah-ben-yomo', BELOW],
  0x05ab: ['ole', ABOVE],
  0x05ac: ['iluy', ABOVE],
  0x05ad: ['dehi', BELOW],
  0x05ae: ['zinor', ABOVE],
  0x05af: ['masora-circle', ABOVE],
  // points, U+05B0..
  0x05b0: ['sheva', BELOW],
  0x05b1: ['hataf-segol', BELOW],
  0x05b2: ['hataf-patah', BELOW],
  0x05b3: ['hataf-qamats', BELOW],
  0x05b4: ['hiriq', BELOW],
  0x05b5: ['tsere', BELOW],
  0x05b6: ['segol', BELOW],
  0x05b7: ['patah', BELOW],
  0x05b8: ['qamats', BELOW],
  0x05b9: ['holam', ABOVE],
  0x05ba: ['holam-haser-vav', ABOVE],
  0x05bb: ['qubuts', BELOW],
  0x05bc: ['dagesh', INSIDE],
  0x05bd: ['meteg', BELOW],
  0x05bf: ['rafe', ABOVE],
  0x05c1: ['shin-dot', ABOVE],
  0x05c2: ['sin-dot', ABOVE],
  0x05c7: ['qamats-qatan', BELOW],
}).map(([k, v]) => [Number(k), { name: v[0], zone: v[1] }]));

/** Structural characters that are not marks on a letter. */
export const MAQAF = 0x05be;
export const PASEQ = 0x05c0;
export const SOF_PASUQ = 0x05c3;

export const isLetter = (cp) => cp >= 0x05d0 && cp <= 0x05ea;

/**
 * Decompose a corpus word into its letters and the marks each one carries.
 *
 * Order is preserved as the corpus gives it - the API guide is explicit that
 * combining-mark order is meaningful here, so nothing is normalised.
 */
export function analyseWord(ktiv) {
  const letters = [];
  const marks = [];
  let segments = 1;
  for (const ch of String(ktiv)) {
    const cp = ch.codePointAt(0);
    if (isLetter(cp)) { letters.push({ ch, marks: [] }); continue; }
    if (cp === MAQAF) { segments += 1; continue; }
    if (cp === PASEQ || cp === SOF_PASUQ) continue;
    const m = MARKS.get(cp);
    if (!m) continue;
    const rec = { ...m, cp, ch, letterIndex: letters.length - 1 };
    marks.push(rec);
    if (letters.length) letters[letters.length - 1].marks.push(rec);
  }
  const count = (z) => marks.filter((m) => m.zone === z).length;
  return {
    letters: letters.length,
    // How many visual pieces the word prints as. A maqaf joins its parts into
    // one unit on the page, so this stays 1 for a chain - but the letter count
    // spans all of it.
    segments,
    marks,
    above: count(ABOVE),
    below: count(BELOW),
    inside: count(INSIDE),
    teamim: marks.filter((m) => m.cp <= 0x05af).map((m) => m.name),
  };
}
