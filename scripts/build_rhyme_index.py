#!/usr/bin/env python3
"""Build public/rhyme-index.tsv, the offline rhyme dictionary, from CMUdict.

    pip install cmudict
    python3 scripts/build_rhyme_index.py

One line per word:  word <TAB> rhyme tail <TAB> syllable count
The rhyme tail is the phonemes from the last stressed vowel to the end of the
word (stress digits removed), e.g. "tonight" -> "AY T". Two words rhyme
perfectly when their tails are identical. The app fetches this file once and
keeps it in Cache Storage (see src/rhyme/offlineIndex.ts), so rhyme search
keeps working with no network. Keep tail_of() in sync with the TypeScript copy.
"""
import re
import sys
from pathlib import Path

import cmudict

OUT = Path(__file__).resolve().parent.parent / "public" / "rhyme-index.tsv"
VOWEL = re.compile(r"^[A-Z]+([012])$")


def tail_of(phones):
    """Phonemes from the last primary-stressed vowel (else secondary, else last vowel)."""
    start = None
    for wanted in ("1", "2"):
        for i, p in enumerate(phones):
            m = VOWEL.match(p)
            if m and m.group(1) == wanted:
                start = i
        if start is not None:
            break
    if start is None:
        for i, p in enumerate(phones):
            if VOWEL.match(p):
                start = i
    if start is None:
        return None
    return [re.sub(r"[012]$", "", p) for p in phones[start:]]


def main():
    entries = cmudict.dict()
    rows = []
    for word in sorted(entries):
        if not re.fullmatch(r"[a-z]+", word):
            continue  # skip apostrophes, hyphens, digits
        phones = entries[word][0]
        tail = tail_of(phones)
        if not tail:
            continue
        syllables = sum(1 for p in phones if VOWEL.match(p))
        rows.append(f"{word}\t{' '.join(tail)}\t{syllables}")
    OUT.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} words to {OUT} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
