# Project instructions

This repository is a strategy/constraint project for Imaginarium Theater.

## Source of Truth order

1. Current live run state supplied by the operator.
2. Current-season game facts with explicit provenance.
3. Account capability facts.
4. This repository's strategic policy and tests.
5. External guides as evidence/reference, never as unquestioned policy.

## Non-negotiable rules

1. **Mechanics before generic strength.** A required boss/challenge mechanic is a
   hard constraint. Generic tier-list strength or buff preference cannot replace it.

2. **Preserve future feasibility.** Before recommending the use of a strategically
   relevant character, check whether at least one valid route remains for every
   remaining strategic checkpoint.

3. **Random recruitment is not ownership.** If a route requires a standby/unrecruited
   character, label the route conditional. Do not present it as guaranteed.

4. **Strategic scope only.** Do not over-plan ordinary auxiliaries/filler. If several
   auxiliary choices keep the same strategic routes alive, leave that choice to
   tactical play.

5. **Buff claims require current text/evidence.** Never infer a buff from a guide
   headline or from an older season. Record the current effect and source before
   turning it into a hard or high-confidence recommendation.

6. **Dynamic update.** Recompute after decision-relevant state changes: recruitment,
   vigor use, checkpoint completion, buff acquisition, refresh use, or new verified
   season information.

7. **Fallbacks are first-class.** Important checkpoints need alternatives where the
   account actually has them. A named-character reservation is a policy choice, not
   the fundamental model.

8. **Objective.** Default to stable completion of act 10 plus the two Sacred Card
   challenges with minimal restarts. Stars/flowers are secondary unless the operator
   explicitly changes the objective.

## Change discipline

- Keep game facts, account facts, policy, and live run state separate.
- Add a regression test for every consequential strategy failure that should not recur.
- Prefer a small deterministic guard over prompt prose when a rule is mechanically decidable.
- Do not add an app, framework, database, or optimizer dependency unless the existing
  lightweight core cannot represent a demonstrated need.

## Validation

Before calling a strategy mechanism complete:
- a known bad case must be rejected;
- a representative allowed case must pass;
- a fallback case must remain allowed when it truly preserves completion;
- stochastic/unknown state must not be silently upgraded to guaranteed.
