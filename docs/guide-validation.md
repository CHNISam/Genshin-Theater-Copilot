# One-image guide validation — 2026-10-10

Current delivery: `guides/output/2026-10-guide.png` and its self-contained HTML preview.
Source/asset inventory: `guides/2026-10.json`; machine receipt beside the PNG.

- Full suite with optional Pillow: **129 passed** (105 existing + 24 guide/export cases).
- Core self-test with C locale, Python UTF-8 mode disabled: **102 passed**.
- Existing season schema validation: passed; its separate full public audit remains PARTIAL_PUBLIC, 12/48.
- Current image: **3200 × 3265**, 12 rows, 18 identified UI assets, 138 measured text lines, no text outside measured horizontal cell or image bounds.
- Full-image visual review: Chinese text legible, enemy/name match, two lector alternatives both illustrated, five columns and all lower sections present.
- Export works offline; hashes bind content, font and PNG. Hashes and tests are integrity/implementation evidence, not independent proof of game truth.

Review regressions cover missing encounters from both rows/order, reordered acts, alias character duplication, vigor overuse, restricted team elements, absent/changed/unreviewed assets, wrong-season sources, long CJK text, four Buff groups, long headings, and malformed sections/entries/scalars. The fresh review's original five findings were reproduced and fixed.

The concrete default helper is cryo Wriothesley; Skirk teams use only water/ice slots. Other portrait recommendations require a different full allocation, not a direct swap. Auxiliary roles are conditional placeholders for distinct recruited characters, not a claim that this account owns them or has cleared the season. No actual-account clear or user-use acceptance is recorded here. Project status lives only in Backlog.md.
