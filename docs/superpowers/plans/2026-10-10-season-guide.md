# Seasonal one-image guide implementation plan

Execution: inline in this session, as explicitly requested on 2026-10-10. Spec: docs/season-guide.md, with online game UI imagery accepted by the user.

Goal: produce a reusable offline export pipeline and the current October guide PNG.
Architecture: reviewed season-guide JSON plus vendored identified UI assets → dependency-free semantic validation → optional Pillow renderer → PNG and audit receipt. Existing gameplay core remains the source for live guards.

Constraints: no game screenshots required from the player; all 12 target nodes on one image; no unverified numeric claims; no missing-asset placeholders; current facts and guide proposals distinct; downstream live UNKNOWN must not become SAFE.
Review focus: next-season IDs, missing/wrong assets, duplicate resources, long CJK text, stale/conflicting source content.

1. Data/validation — tests/test_season_guide.py tests coverage, four slots, role/character vigor, source dates/season, asset hashes and paths, unreviewed claims, card order, and incomplete exports. Observe RED; implement src/season_guide.py validate_guide(data, root), load_guide(path). Record current content and image provenance in guides/2026-10.json.
2. Rendering — tests for character wrapping and no clipping, real image decode, atomic export and deterministic receipt. Observe RED; implement tools/render_guide.py render_guide(path, output, font_path, width=3200). Font and assets stay local at render time; fail rather than shrink unreadably/truncate silently. Export PNG plus source-linked HTML for review.
3. Delivery — acquire and inspect sourced UI assets; build current guide, visually inspect full image and enlarged cells; update AGENT/SOP/research prompt/README/Backlog. Run entire suite and clean diff; review branch; push and create PR. No guide truth or account success claim from tests alone.
