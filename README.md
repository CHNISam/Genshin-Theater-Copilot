# Imaginarium Theater Pilot

A long-lived strategy project for Genshin Impact's Imaginarium Theater.

The project is **not** a static walkthrough and does not assume it must become an app.
Its job is to keep a run strategically viable while the roster, recruitment offers,
buff offers, stamina/vigor, and encounter state change.

## Core idea

The central invariant is:

> **Do not recommend an action that destroys every feasible route through the
> remaining strategic checkpoints, unless the operator explicitly chooses an
> emergency override.**

This is intentionally stricter than "save strong characters" and more flexible
than "character X must fight act Y".

A checkpoint can have multiple valid plans. The guard reasons over those
alternatives and remaining vigor. If an action still leaves at least one valid
future route, it is allowed. If it destroys every route, it is blocked.

## Decision layers

1. **Season facts** — current elements, bosses, mechanics, buffs, event rules.
2. **Account facts** — owned/borrowed characters and the capabilities they actually provide.
3. **Strategic checkpoints** — only fights/mechanics that can decide the run.
4. **Live state** — current act, recruited roster, vigor, flowers, refreshes, buffs.
5. **Feasibility guard** — preserve at least one completion route.
6. **Soft policy** — rank good options among actions that remain feasible.
7. **Tactics** — auxiliary/filler picks and moment-to-moment team details stay flexible.

## What is hard vs soft

**Hard / mechanically enforceable**
- Do not spend vigor that makes all remaining checkpoint plans impossible.
- Do not treat an unrecruited character as guaranteed; a route depending on future
  recruitment is reported as conditional.
- Encounter mechanics outrank generic character power when the mechanic is required.
- Unverified season/buff facts must not be promoted into hard rules.

**Soft / operator controlled**
- Which ordinary-stage auxiliary to bring.
- Exact four-character tactical composition when several choices are viable.
- Whether to spend flowers for comfort after strategic coverage is already safe.
- Preference among multiple safe buff or recruitment options.

## Current status

The repository existed from August 2026 but contained only a license. This
bootstrap establishes the first real project baseline:

- a generic future-route feasibility guard;
- dynamic recruitment ranking;
- regression tests for reservation/fallback behavior;
- project rules for provenance and strategic-vs-tactical scope;
- historical failure lessons so solved mistakes do not recur.

No UI is required yet. The current delivery surface is a small Python policy
core plus declarative season/run data added over time.

## Run tests

```bash
python -m unittest discover -s tests -v
```

## Next useful increments

Add only when real use demands them:

- current-season fact pack with source provenance;
- account capability map;
- live run snapshot import (manual, screenshot-assisted, or API-assisted);
- buff-effect scoring based on verified current text;
- richer checkpoint-plan compilation;
- a UI only if input friction becomes the dominant problem.
