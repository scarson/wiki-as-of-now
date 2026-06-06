// ABOUTME: NFC normalization test corpus for the workerd↔Node parity golden fixture.
// ABOUTME: All entries use \uXXXX / \u{...} escapes — no pasted invisible characters.

export const NFC_CORPUS: string[] = [
  // composed vs decomposed accent: NFD e+combining-acute (U+0301) → NFC composes to é (U+00E9)
  "cafe\u0301",

  // composed vs decomposed accent: NFC precomposed é (U+00E9) — identity under NFC
  "caf\u00E9",

  // multi-combining-mark: a + U+0300 (combining grave) + U+0303 (combining tilde) — NFC composes a+grave to à
  "a\u0300\u0303",

  // recent-Unicode addition: U+1F9A0 MICROBE and U+1F9A1 BADGER (added Unicode 12.0)
  "\u{1F9A0} and \u{1F9A1}",

  // strip set: soft-hyphen U+00AD between letters
  "inter\u00ADnational",

  // strip set: zero-width space U+200B between letters
  "zero\u200Bwidth",

  // strip set: ZWNJ U+200C and ZWJ U+200D embedded
  "non\u200Cjoiner\u200Djoiner",

  // strip set: Word Joiner U+2060 and ZWNBSP U+FEFF embedded
  "word\u2060joiner\uFEFFbom",

  // fold set: ideographic-space U+3000 + em-space U+2003 + en-space U+2002 → one ASCII space
  "a\u3000\u2003\u2002b",

  // fold set: tab U+0009 + NBSP U+00A0 + narrow-NBSP U+202F → one ASCII space
  "x\u0009\u00A0\u202Fy",

  // \n survives — adjacent spaces collapse, block boundary preserved
  "line1  \n  line2",

  // astral-plane emoji: U+1F600 GRINNING FACE — NFC is identity
  "hello \u{1F600} world",

  // astral-plane CJK Extension B: U+20000 — NFC is identity
  "\u{20000} ideograph",

  // plain ASCII: leading/trailing spaces trimmed, internal run collapsed
  "  Plain text.  ",

  // vertical separator: LS (U+2028) between words -> \n block boundary on workerd
  "alpha\u2028beta",

  // vertical separator run: FF (U+000C) + VT (U+000B) between words -> single \n block boundary on workerd
  "xy\u000C\u000Bz",

];
