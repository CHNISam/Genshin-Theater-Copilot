import copy
import unittest
from src.fight_guard import convergence, strategy_key, validate_reroute


def attempt(score=None, seconds=90, mechanics_ok=True, key='original', result='fail', window=90):
    return dict(score=score, seconds=seconds, mechanics_ok=mechanics_ok, plan_key=key,
                result=result, metric={'id': 'damage-at-window', 'window_seconds': window})


class ConvergenceTests(unittest.TestCase):
    def test_prepared_trial_and_one_failure_allowed(self):
        self.assertIsNone(convergence([]))
        self.assertIsNone(convergence([attempt(40)]))

    def test_original_failure_future_safe_does_not_allow_third_flat_trial(self):
        self.assertEqual(convergence([attempt(40), attempt(42)]), 'REPEATED_NON_CONVERGENCE')

    def test_missing_telemetry_cannot_prove_convergence(self):
        self.assertEqual(convergence([attempt(), attempt()]), 'REPEATED_NON_CONVERGENCE')

    def test_meaningful_progress_permits_bounded_retry(self):
        self.assertIsNone(convergence([attempt(40), attempt(52)]))

    def test_worse_then_recover_to_old_best_is_not_new_progress(self):
        self.assertEqual(convergence([attempt(70), attempt(40), attempt(70)]), 'REPEATED_NON_CONVERGENCE')

    def test_mechanic_failure_needs_immediate_diagnosis(self):
        self.assertEqual(convergence([attempt(80, mechanics_ok=False)]), 'MECHANIC_FAILED')

    def test_longer_window_does_not_fake_more_damage(self):
        self.assertEqual(convergence([attempt(40), attempt(70, window=180)]), 'INCOMPARABLE_METRIC')

    def test_total_budget_even_when_improving(self):
        self.assertEqual(convergence([attempt(x) for x in [10, 25, 40, 55, 70, 85]]), 'TRIAL_BUDGET_EXHAUSTED')
        self.assertEqual(convergence([attempt(10, 500), attempt(30, 500)]), 'TRIAL_BUDGET_EXHAUSTED')

    def test_plan_rename_does_not_reset_stop(self):
        a = {'team': ['a', 'b', 'c', 'd'], 'rotation': 'normal', 'plan_id': 'old', 'notes': 'x'}
        b = copy.deepcopy(a); b.update(plan_id='new', notes='try harder')
        self.assertEqual(strategy_key(a), strategy_key(b))
        self.assertEqual(convergence([attempt(40, key='one'), attempt(40, key='two')]), 'REPEATED_NON_CONVERGENCE')

    def test_new_reviewed_evidence_and_material_change_unlock(self):
        old = dict(team=['a', 'b', 'c', 'd'], rotation='normal')
        new = dict(team=['a', 'b', 'c', 'e'], rotation='normal')
        review = dict(evidence_id='new-ref', bottleneck='party damage drain',
                      comparison='clear reference uses party heal; old team shields only',
                      hypothesis='at 90s progress >= 55 with all alive', reviewed=True)
        self.assertIsNone(validate_reroute(old, new, review, {'new-ref'}, set()))
        self.assertIsNotNone(validate_reroute(old, old, review, {'new-ref'}, set()))
        self.assertIsNotNone(validate_reroute(old, new, review, {'new-ref'}, {'new-ref'}))
        self.assertIsNone(convergence([attempt(40), attempt(40)], reroute_start=2))
        self.assertEqual(convergence([attempt(40), attempt(40), attempt(30), attempt(30)], reroute_start=2), 'REPEATED_NON_CONVERGENCE')

    def test_null_or_containers_are_not_a_review(self):
        old=dict(team=['a','b','c','d']);new=dict(team=['a','b','c','e'])
        review=dict(evidence_id='fresh',reviewed=True,bottleneck=None,comparison=[],hypothesis={})
        self.assertIsNotNone(validate_reroute(old,new,review,{'fresh'},set()))
