# One-image guide validation — 2026-10-10 revision

Delivery: `guides/output/2026-10-guide.png`, self-contained HTML, JSON content and export receipt. Builds on merged PR #4; no new service/framework.

- Full suite with Pillow: **145 passed** (129 previous + 16 editorial/semantic regressions).
- Core self-test with C locale and UTF-8 mode disabled: **102 passed**.
- Existing season schema passes. The broader public audit remains **PARTIAL_PUBLIC, 12/48**, separate from guide production. Its complete branch coefficients/prices, encounter parameters and act-8 conflicts remain B-04.
- Current PNG: **3200 × 1924**, 12 rows, 17 used identified UI assets, 113 measured text lines, no horizontal/image clipping.
- Fresh whole-image review: five reference-style columns, two Sacred Cards, concise sidebar, actual enemy icons, three Buff groups and four helper portraits; no internal calculation/source prose. Portrait text includes helper-specific team conditions.

Changes independently reviewed against current game captures, TapTap October mechanics, current guide route text and available game skill/Buff text: first-act horned bear, second-act Primus, fifth-act channel contact; fourth-act Fatui aggro/time route; all-party healing for card 1; aimed shots for act 6; Cryo shield/balls for act 8; sustained Cryo for act 10. Conflicting exact resistances/times excluded. Helpers independently reviewed for strength, constellation, encounter and team fit; no comparable measured DPS dataset, hence no absolute ranking.

Regressions reject excessive/internal player prose, template-only helper/Buff evidence, missing review, shield/active-only healing replacing party healing, deleting card requirements to bypass the encounter contract, generic Anemo replacing equipped on-field VV, missing Cryo application, malformed capability/VV data and unversioned production export. Allowed healing fallback remains allowed. Existing asset/hash, identity/vigor/element, encounter coverage and layout regressions remain. Candidate helper routes reuse the core identity/vigor/element checks and capability requirements.

Factual evidence and limitations remain in JSON review/source records and offline HTML: Fatui simultaneous count lacks independent original footage; card-2 explosion shield interaction is unresolved and not claimed; no actual-account clear, observed recruitment sequence or user acceptance. Sources/typed tags/reviewed markers are author inputs, not an automated game-truth oracle. The human content review gate is required each season.

User editorial follow-up: act-10 before/after cells now blank; no-choice cells may be empty without filler, while missing/non-string fields and missing core team/encounter/mechanic content still fail. 148 tests pass after updating the obsolete forced-nonempty regression.
