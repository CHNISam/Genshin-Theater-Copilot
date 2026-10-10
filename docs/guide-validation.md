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


## Revision 2 — 2026-10-10

The earlier figures above describe PR #4, not the revised output. Current verification: 163 unittest cases passed; existing core self-test102 passed; season schema remains valid but public coverage remains partial12/48. Export is3200×3087,12rows,21reviewed game UI assets,6helper candidates,120measured text lines,zero clipped cells. PNG inspected in full after export, including revised enemy icon, conditional recruitment sentence, Sacred Card survival, helper portraits and footer.

Strategy revision replaces anonymous filler identities with25named characters /48vigor, retains28-character admission separately, and checks capability-contract coverage, Sacred Card unlock timing, on-field VV equipment/reaction and damage-proc compatibility. Independent review found hidden recruitment conditions, deletable constraints, mismatched historical scope, unbound factual input and empty comparison evidence; regressions reproduced each before repair. Null nested capability lists now fail closed.

Archive:28partial factual packets,3frozen independent retrospective proposals,July8-act revised research draft and one partial mechanism/reference comparison. Historical packets and captured evidence bytes are audited; initial freeze originals remain untouched, post-freeze input capture is labeled separately. No account-specific clear, simultaneous historical snapshot, full expert comparison, or full28-guide completion is certified. B-07/B-04/B-06remain open.
