# Strategy architecture

## Problem frame

Imaginarium Theater is a **dynamic resource-allocation problem under partial
information**, not a static stage-by-stage team list.

The scarce strategic resources are primarily:
- character vigor/uses;
- access to unrecruited standby characters;
- flowers/refresh opportunities;
- mechanism-specific capability;
- time/opportunity before a checkpoint deadline.

The system should answer:

> Given the state now, which actions remain strategically safe, and which one has
> the best leverage without closing the run?

## Root causes of prior planning failures

### 1. Static-script failure
A fixed "act N -> character X" table breaks as soon as recruitment order changes.

**Correction:** represent each important checkpoint with multiple valid plans and
recompute from live state.

### 2. Strength-over-mechanic failure
A generally stronger character can still be the wrong asset when an encounter
requires a specific element, hit pattern, healing profile, range, or reaction.

**Correction:** checkpoint mechanics define admissible plans before power ranking.

### 3. Buff-first failure
Buff optimization can consume flowers or bias planning before the roster needed
to finish the run is secured.

**Correction:** feasibility/recruitment gaps outrank buff optimization.

### 4. Unverified-effect failure
A guide summary or memory of a prior cycle can misstate a current buff.

**Correction:** current buff text + provenance is required before hard-coding the effect.

### 5. Over-planning auxiliaries
Trying to prescribe every support/filler adds complexity without changing the
strategic decision.

**Correction:** keep auxiliaries tactical unless they are a mechanism key.

### 6. Randomness treated as certainty
A standby character may be recruitable later but is not guaranteed now.

**Correction:** distinguish SAFE routes (currently unlocked) from CONDITIONAL
routes (depend on future recruitment) and BROKEN routes.

## Model

```text
verified season facts
        +
account capability map
        +
live run state
        |
        v
strategic checkpoint plans
        |
        v
future-route feasibility
        |
        +--> BROKEN      => block / emergency decision
        +--> CONDITIONAL => warn + raise recruitment priority
        +--> SAFE        => rank by soft policy
```

A **checkpoint plan** is deliberately small. It lists only strategically scarce
characters/capabilities whose vigor matters. Filler slots are omitted.

Example:

```python
Checkpoint(
    "Act 10",
    options=(
        PlanOption("Skirk route", {"skirk": 1}),
        PlanOption("Ayaka fallback", {"ayaka": 1, "cryo_support": 1}),
    ),
)
```

The engine does not claim that these are the entire four-person teams. It only
protects the strategic resources.

## Hard-but-flexible invariant

An action is hard-blocked only when, after applying it, **no combination of
remaining checkpoint options fits inside remaining vigor**.

This gives both properties we want:
- **hard**: a truly dead future state cannot silently pass;
- **flexible**: named characters are not frozen to acts when a valid fallback exists.

## Recruitment

Recruitment is dynamic. Candidate ranking should prefer the candidate that:
1. turns BROKEN -> CONDITIONAL/SAFE;
2. turns CONDITIONAL -> SAFE;
3. increases the number of feasible future routes;
4. improves soft preferences after strategic safety is already equal.

This makes "who to draw now?" state-dependent instead of a fixed global tier list.

## Buffs

Buff selection belongs after the hard feasibility layer.

A future buff scorer should consume:
- verified effect text;
- affected elements/reactions/characters;
- planned checkpoint cores;
- expected number of future uses;
- mechanism relevance;
- opportunity cost in flowers.

It must never invent an effect or let a generic guide recommendation override the
actual account plan.

## Input surface

Do not build a UI prematurely. The desired end state is low-friction state capture.
Acceptable future sources include:
- small manual snapshots at decision points;
- screenshot-assisted extraction;
- an available trustworthy API/import.

The implementation should be chosen only when input friction becomes the dominant gap.
