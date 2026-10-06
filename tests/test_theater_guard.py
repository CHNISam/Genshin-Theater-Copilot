import unittest

from src.theater_guard import (
    Checkpoint,
    PlanOption,
    RouteStatus,
    rank_recruit_candidates,
    route_status,
    status_after_use,
)


def option(name, **consumes):
    return PlanOption.from_mapping(name, consumes)


class FutureRouteGuardTests(unittest.TestCase):
    def test_blocks_spending_last_future_route(self):
        vigor = {"skirk": 2, "wanderer": 2}
        checkpoints = (
            Checkpoint("Act 8", (option("Skirk", skirk=1),)),
            Checkpoint("Act 10", (option("Skirk", skirk=1),)),
        )
        status = status_after_use(
            vigor,
            used_characters=["skirk"],
            checkpoints=checkpoints,
            unlocked={"skirk", "wanderer"},
            roster={"skirk", "wanderer"},
        )
        self.assertEqual(status, RouteStatus.BROKEN)

    def test_allows_use_when_real_fallback_preserves_route(self):
        vigor = {"skirk": 2, "ayaka": 1, "wanderer": 2}
        checkpoints = (
            Checkpoint(
                "Act 8",
                (
                    option("Skirk", skirk=1),
                    option("Ayaka fallback", ayaka=1),
                ),
            ),
            Checkpoint("Act 10", (option("Skirk", skirk=1),)),
        )
        status = status_after_use(
            vigor,
            used_characters=["skirk"],
            checkpoints=checkpoints,
            unlocked={"skirk", "ayaka", "wanderer"},
            roster={"skirk", "ayaka", "wanderer"},
        )
        self.assertEqual(status, RouteStatus.SAFE)

    def test_unrecruited_route_is_conditional_not_safe(self):
        vigor = {"skirk": 2, "wanderer": 2}
        checkpoints = (
            Checkpoint("Act 8", (option("Skirk", skirk=1),)),
            Checkpoint("Act 10", (option("Skirk", skirk=1),)),
        )
        status = route_status(
            vigor,
            checkpoints,
            unlocked={"wanderer"},
            roster={"wanderer", "skirk"},
        )
        self.assertEqual(status, RouteStatus.CONDITIONAL)

    def test_recruit_ranking_is_state_dependent(self):
        vigor = {"skirk": 2, "ganyu": 1, "generic_support": 2}
        checkpoints = (
            Checkpoint(
                "Act 8",
                (
                    option("Skirk", skirk=1),
                    option("Ganyu fallback", ganyu=1),
                ),
            ),
            Checkpoint("Act 10", (option("Skirk", skirk=1),)),
        )
        ranked = rank_recruit_candidates(
            vigor,
            checkpoints,
            unlocked={"generic_support"},
            roster={"skirk", "ganyu", "generic_support"},
            candidates=["generic_support", "skirk", "ganyu"],
        )
        self.assertEqual(ranked[0][0], "skirk")
        self.assertEqual(ranked[0][1], RouteStatus.SAFE)

    def test_irrelevant_auxiliary_does_not_create_fake_coverage(self):
        vigor = {"skirk": 2, "aux": 2}
        checkpoints = (
            Checkpoint("Act 10", (option("Skirk", skirk=1),)),
        )
        status = route_status(
            vigor,
            checkpoints,
            unlocked={"aux"},
            roster={"aux"},
        )
        self.assertEqual(status, RouteStatus.BROKEN)


if __name__ == "__main__":
    unittest.main()
