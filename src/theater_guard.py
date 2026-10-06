"""Future-route feasibility guard for Imaginarium Theater.

This module intentionally models only *strategically scarce* character use.
It does not try to construct complete four-character tactical teams.

A checkpoint has alternative PlanOptions. Each option consumes one or more vigor
points from strategically relevant characters. The guard searches for at least
one combination of options that can cover all remaining checkpoints.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from functools import lru_cache
from typing import Iterable, Mapping, Sequence


@dataclass(frozen=True)
class PlanOption:
    name: str
    # Sorted tuple of (character_id, vigor_cost). Use from_mapping for convenience.
    consumes: tuple[tuple[str, int], ...]

    @classmethod
    def from_mapping(cls, name: str, consumes: Mapping[str, int]) -> "PlanOption":
        normalized = tuple(sorted((k, int(v)) for k, v in consumes.items() if v > 0))
        return cls(name=name, consumes=normalized)


@dataclass(frozen=True)
class Checkpoint:
    name: str
    options: tuple[PlanOption, ...]


class RouteStatus(IntEnum):
    BROKEN = 0
    CONDITIONAL = 1
    SAFE = 2


def _normalize_vigor(vigor: Mapping[str, int], allowed: set[str] | None = None) -> tuple[tuple[str, int], ...]:
    items = []
    for character, points in vigor.items():
        if allowed is not None and character not in allowed:
            continue
        if points > 0:
            items.append((character, int(points)))
    return tuple(sorted(items))


def _option_fits(option: PlanOption, vigor: Mapping[str, int]) -> bool:
    return all(vigor.get(character, 0) >= cost for character, cost in option.consumes)


def _spend(vigor: Mapping[str, int], consumes: Iterable[tuple[str, int]]) -> dict[str, int]:
    result = dict(vigor)
    for character, cost in consumes:
        result[character] = result.get(character, 0) - cost
        if result[character] < 0:
            raise ValueError(f"negative vigor for {character}")
    return result


def feasible(vigor: Mapping[str, int], checkpoints: Sequence[Checkpoint], allowed: set[str] | None = None) -> bool:
    """Return True when at least one strategic route covers every checkpoint."""

    names = tuple(sorted(vigor))
    start = tuple(vigor.get(name, 0) if allowed is None or name in allowed else 0 for name in names)

    @lru_cache(maxsize=None)
    def search(index: int, remaining: tuple[int, ...]) -> bool:
        if index >= len(checkpoints):
            return True

        state = dict(zip(names, remaining))
        checkpoint = checkpoints[index]

        for option in checkpoint.options:
            if not _option_fits(option, state):
                continue
            next_state = _spend(state, option.consumes)
            next_remaining = tuple(next_state.get(name, 0) for name in names)
            if search(index + 1, next_remaining):
                return True
        return False

    return search(0, start)


def count_routes(
    vigor: Mapping[str, int],
    checkpoints: Sequence[Checkpoint],
    allowed: set[str] | None = None,
    cap: int = 10_000,
) -> int:
    """Count feasible strategic routes up to cap.

    Route count is a ranking aid, not a probability estimate.
    """

    names = tuple(sorted(vigor))
    start = tuple(vigor.get(name, 0) if allowed is None or name in allowed else 0 for name in names)

    @lru_cache(maxsize=None)
    def search(index: int, remaining: tuple[int, ...]) -> int:
        if index >= len(checkpoints):
            return 1

        state = dict(zip(names, remaining))
        total = 0
        for option in checkpoints[index].options:
            if not _option_fits(option, state):
                continue
            next_state = _spend(state, option.consumes)
            next_remaining = tuple(next_state.get(name, 0) for name in names)
            total += search(index + 1, next_remaining)
            if total >= cap:
                return cap
        return total

    return search(0, start)


def route_status(
    vigor: Mapping[str, int],
    checkpoints: Sequence[Checkpoint],
    unlocked: set[str],
    roster: set[str],
) -> RouteStatus:
    """Classify future coverage.

    SAFE: a route exists using only currently unlocked characters.
    CONDITIONAL: no unlocked-only route exists, but one exists if future standby
                 recruitment succeeds.
    BROKEN: no route exists even with the full participating roster.
    """

    if feasible(vigor, checkpoints, allowed=unlocked):
        return RouteStatus.SAFE
    if feasible(vigor, checkpoints, allowed=roster):
        return RouteStatus.CONDITIONAL
    return RouteStatus.BROKEN


def status_after_use(
    vigor: Mapping[str, int],
    used_characters: Iterable[str],
    checkpoints: Sequence[Checkpoint],
    unlocked: set[str],
    roster: set[str],
) -> RouteStatus:
    """Apply one vigor use to each named character and classify the future."""

    next_vigor = dict(vigor)
    for character in used_characters:
        if next_vigor.get(character, 0) <= 0:
            return RouteStatus.BROKEN
        next_vigor[character] -= 1
    return route_status(next_vigor, checkpoints, unlocked=unlocked, roster=roster)


def rank_recruit_candidates(
    vigor: Mapping[str, int],
    checkpoints: Sequence[Checkpoint],
    unlocked: set[str],
    roster: set[str],
    candidates: Iterable[str],
) -> list[tuple[str, RouteStatus, int]]:
    """Rank offered recruits by strategic leverage.

    Primary key: resulting route status.
    Secondary key: number of unlocked-only feasible strategic routes.

    Soft account-specific preferences can be layered on top after these keys.
    """

    ranked: list[tuple[str, RouteStatus, int]] = []
    for candidate in candidates:
        next_unlocked = set(unlocked)
        next_unlocked.add(candidate)
        status = route_status(vigor, checkpoints, unlocked=next_unlocked, roster=roster)
        routes = count_routes(vigor, checkpoints, allowed=next_unlocked)
        ranked.append((candidate, status, routes))

    ranked.sort(key=lambda row: (int(row[1]), row[2], row[0]), reverse=True)
    return ranked
