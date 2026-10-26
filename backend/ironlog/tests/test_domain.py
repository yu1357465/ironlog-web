"""Pure-logic tests. Expected numbers match ironlog-android's StrengthTest/PlanShareTest/HistoryImportTest."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from ironlog.domain import history_csv, share, standards, strength
from ironlog.domain.share import SharedDay, SharedExercise, SharedPlan
from ironlog.domain.strength import Lift, RadarMode

NOW = datetime(2026, 10, 26, 12, tzinfo=timezone.utc)
UTC = ZoneInfo("UTC")

# Produced by ironlog-android's PlanShare.encode(); keep in sync with docs/formats.md.
ANDROID_CODE = (
    "FP1:eNqrVspLzE1VslJ61rfiWXfni9b9CgEBPko6SimJlcVKVtHVSqkVqUXJmcWpEF5RagGQYaGjVJxaAmSY6MD1z13wcnLz052bn83d_7R3OdA4"
    "oCHlqZnpGSXe6UpWZgY6SulF-aUFQKXOHq7BIUq1OjDTDA1gxhnDjXs6eSLQOKApT3bsU0JoDfbwD_VxcQ0KVqqN1UFy-tOu2c-mLwWbic29pjAL"
    "TNHc-2z7xhc7N6G41ALJpT6u7ig2AYPnZfMKsE1AwZLKApBgWmZJXmpxsW5BTmIe0KSy1KLizPw8oLdqAcbYhoM"
)
ANDROID_PLAN = SharedPlan("推拉腿 PPL", [
    SharedDay("推力日", [
        SharedExercise("杠铃平板卧推", "CHEST", 4, 8, 60.0),
        SharedExercise("哑铃推举", "SHOULDERS", 3, 10, None),
    ]),
    SharedDay("腿部日", [SharedExercise("杠铃深蹲", "LEGS", 5, 5, 80.0)]),
])


def lift(name, group, weight, reps, sets=3, days_ago=1, ex_id=None):
    return Lift(ex_id if ex_id is not None else hash(name), name, group, weight, reps, sets,
                NOW - timedelta(days=days_ago))


def score(*lifts, bw=70.0, ape=1.0, mode=RadarMode.OVERALL):
    return strength.analyze(list(lifts), mode, bw, ape, NOW).scores


class StrengthTests(SimpleTestCase):
    def test_formulas_meet_at_ten_reps(self):
        self.assertAlmostEqual(strength.estimate_1rm(100, 1), 100)
        b, e = strength.brzycki(50, 10), strength.epley(50, 10)
        self.assertLess(abs(b - e) / b, 0.01)
        self.assertAlmostEqual(strength.estimate_1rm(40, 15), strength.epley(40, 15))

    def test_bench_at_one_and_half_bodyweight_is_full(self):
        self.assertAlmostEqual(score(lift("杠铃平板卧推", "CHEST", 105, 1))["CHEST"], 100, places=2)
        self.assertAlmostEqual(score(lift("Barbell Bench Press", "CHEST", 105, 1))["CHEST"], 100, places=2)

    def test_same_scores_as_android(self):
        self.assertAlmostEqual(score(lift("绳索下压", "ARMS", 20, 12))["ARMS"], 57.1, delta=0.2)
        self.assertAlmostEqual(score(lift("哑铃推举", "SHOULDERS", 14, 10))["SHOULDERS"], 63.5, delta=0.2)
        self.assertAlmostEqual(score(lift("引体向上", "BACK", 0, 8))["BACK"], 82.8, delta=0.2)
        self.assertAlmostEqual(score(lift("悬垂举腿", "CORE", 0, 12))["CORE"], 80, places=2)
        self.assertAlmostEqual(score(lift("自重俯卧撑", "CHEST", 0, 15))["CHEST"], 65.0, delta=0.2)
        self.assertAlmostEqual(score(lift("直臂下拉", "BACK", 17, 8))["BACK"], 50.3, delta=0.2)

    def test_english_names_match_same_rules(self):
        for zh, en in [("绳索下压", "Cable Triceps Pushdown"), ("引体向上", "Pull-up"),
                       ("器械反向飞鸟", "Machine Reverse Fly"), ("上斜哑铃弯举", "Incline Dumbbell Curl"),
                       ("哑铃推举", "Dumbbell Shoulder Press")]:
            self.assertEqual(standards.for_exercise(zh, "OTHER"), standards.for_exercise(en, "OTHER"), en)

    def test_rules_pick_the_right_exercise(self):
        self.assertEqual(standards.for_exercise("器械反向飞鸟", "SHOULDERS").ratio, 0.8)
        self.assertEqual(standards.for_exercise("蝴蝶机夹胸", "CHEST").ratio, 1.1)
        self.assertEqual(standards.for_exercise("上斜哑铃弯举", "ARMS").ratio, 0.38)
        self.assertEqual(standards.for_exercise("上斜俯卧撑", "CHEST").bodyweight_fraction, 0.45)

    def test_assisted_pullups_and_core(self):
        self.assertEqual(score(lift("辅助引体向上", "BACK", 0, 12))["BACK"], 0)
        self.assertEqual(score(lift("杠铃深蹲", "LEGS", 140, 1))["CORE"], 0)

    def test_unknown_exercise_uses_group_fallback(self):
        self.assertAlmostEqual(score(lift("Mystery Chest Thing", "CHEST", 98, 1))["CHEST"], 100, places=2)

    def test_mode_filters_reps(self):
        l = lift("杠铃深蹲", "LEGS", 60, 20)
        self.assertEqual(score(l, mode=RadarMode.STRENGTH)["LEGS"], 0)
        self.assertGreater(score(l, mode=RadarMode.ENDURANCE)["LEGS"], 0)

    def test_leverage_capped_and_only_push_pull(self):
        lifts = [lift("杠铃平板卧推", "CHEST", 60, 5), lift("杠铃划船", "BACK", 60, 5), lift("杠铃深蹲", "LEGS", 80, 5)]
        neutral, long_arms = score(*lifts), score(*lifts, ape=1.05)
        self.assertGreater(long_arms["CHEST"], neutral["CHEST"])
        self.assertLess(long_arms["BACK"], neutral["BACK"])
        self.assertEqual(long_arms["LEGS"], neutral["LEGS"])
        self.assertEqual(score(lifts[0], ape=1.08)["CHEST"], score(lifts[0], ape=1.3)["CHEST"])

    def test_recent_window(self):
        r = strength.analyze([lift("杠铃平板卧推", "CHEST", 105, 1, ex_id=1, days_ago=200),
                              lift("杠铃平板卧推", "CHEST", 52.5, 1, ex_id=1, days_ago=3)],
                             RadarMode.OVERALL, 70, 1.0, NOW)
        self.assertTrue(r.recent_only)
        self.assertAlmostEqual(r.scores["CHEST"], 50, places=2)
        old = strength.analyze([lift("杠铃平板卧推", "CHEST", 105, 1, days_ago=200)], RadarMode.OVERALL, 70, 1.0, NOW)
        self.assertFalse(old.recent_only)

    def test_distribution_weighted_by_sets(self):
        d = strength.distribution([lift("a", "CHEST", 50, 5, sets=5), lift("b", "CHEST", 30, 10, sets=3),
                                   lift("c", "CORE", 0, 20, sets=2)])
        self.assertEqual((d.strength, d.hypertrophy, d.endurance), (5, 3, 2))


class ShareTests(SimpleTestCase):
    def test_decodes_code_from_android(self):
        self.assertEqual(share.decode(ANDROID_CODE), ANDROID_PLAN)

    def test_round_trip(self):
        self.assertEqual(share.decode(share.encode(ANDROID_PLAN)), ANDROID_PLAN)
        self.assertEqual(share.decode(share.share_text(ANDROID_PLAN)), ANDROID_PLAN)

    def test_json_file(self):
        import json
        self.assertEqual(share.decode(json.dumps(share.to_json(ANDROID_PLAN), ensure_ascii=False)), ANDROID_PLAN)

    def test_code_inside_chat_message(self):
        self.assertEqual(share.decode("hey, try this:\n" + ANDROID_CODE + "\ngood luck"), ANDROID_PLAN)

    def test_errors(self):
        with self.assertRaises(share.ShareError) as e:
            share.decode(ANDROID_CODE[:-20])
        self.assertIn(e.exception.code, {"incomplete", "corrupt"})
        with self.assertRaises(share.ShareError) as e:
            share.decode("leg day today?")
        self.assertEqual(e.exception.code, "not_found")
        with self.assertRaises(share.ShareError):
            share.decode('{"version":2,"exercises":[]}')

    def test_values_sanitised(self):
        p = share.decode('{"type":"fitness-plan","version":1,"name":"  my   plan ","days":[{"name":"A","exercises":['
                         '{"name":"Bench","group":"CHEST","sets":0,"reps":5000,"weightKg":-5},'
                         '{"name":"Bench","group":"CHEST","sets":3,"reps":8},'
                         '{"name":"X","group":"NOPE","sets":3,"reps":8}]}]}')
        self.assertEqual(p.name, "my plan")
        ex = p.days[0].exercises
        self.assertEqual(len(ex), 2)
        self.assertEqual((ex[0].sets, ex[0].reps, ex[0].weight_kg), (1, 999, 0.0))
        self.assertEqual(ex[1].group, "OTHER")


class HistoryCsvTests(SimpleTestCase):
    def test_template_parses(self):
        p = history_csv.parse(history_csv.template(), UTC)
        self.assertEqual(p.issues, [])
        self.assertEqual(len(p.rows), 4)
        self.assertEqual(p.rows[0].group, "CHEST")

    def test_android_export_header(self):
        csv = "﻿日期,计划,训练日,动作,肌群,重量(kg),组数,次数\n2026-01-03 20:15,PPL,推力日,卧推,胸部,40.0,4,12"
        r = history_csv.parse(csv, UTC).rows[0]
        self.assertEqual((r.plan_name, r.day_name, r.group, r.weight_kg), ("PPL", "推力日", "CHEST", 40.0))
        self.assertEqual(r.performed_at, datetime(2026, 1, 3, 20, 15, tzinfo=UTC))

    def test_legacy_v2_header_and_pounds(self):
        r = history_csv.parse("date,exercise,weight (lbs),sets,reps\n2026/10/02,Bench,220.462,3,5", UTC).rows[0]
        self.assertAlmostEqual(r.weight_kg, 100, places=4)

    def test_issue_lines(self):
        csv = ",".join(history_csv.EXPORT_HEADER) + "\n2026-10-01,,,Bench,Chest,60,4,8\nyesterday,,,Bench,Chest,60,4,8\n"
        p = history_csv.parse(csv, UTC)
        self.assertEqual(len(p.rows), 1)
        self.assertEqual([i.line for i in p.issues], [3])

    def test_group_guess(self):
        self.assertEqual(history_csv.guess_group("悬垂举腿"), "CORE")
        self.assertEqual(history_csv.guess_group("Hanging Leg Raise"), "CORE")
        self.assertEqual(history_csv.guess_group("Leg Curl"), "LEGS")
        self.assertEqual(history_csv.guess_group("Reverse Fly"), "SHOULDERS")
        self.assertEqual(history_csv.guess_group("Skipping"), "OTHER")

    def test_dedupe_and_sessions(self):
        csv = ",".join(history_csv.EXPORT_HEADER) + (
            "\n2025-12-01 06:40,P,A,Bench,Chest,10,3,6\n2025-12-01 06:50,P,A,Bench,Chest,12,3,6"
            "\n2025-12-01 06:40,P,A,Fly,Chest,32,3,12\n2025-12-02,P,B,Squat,Legs,100,5,5")
        parsed = history_csv.parse(csv, UTC)
        existing = [history_csv.dedupe_key(datetime(2025, 12, 2, 9, tzinfo=UTC), "Squat", 100, 5, 5)]
        plan = history_csv.plan(parsed, existing, {"Bench"}, UTC)
        self.assertEqual(plan.duplicates, 1)
        self.assertEqual([len(s) for s in plan.sessions], [2, 1])
        self.assertEqual(plan.new_exercises, ["Fly"])

    def test_export_round_trip(self):
        t = datetime(2026, 10, 20, 18, 30, tzinfo=UTC)
        text = history_csv.export([(t, "P", "Push", "Bench, wide", "CHEST", 62.5, 4, 8)], UTC)
        r = history_csv.parse(text, UTC).rows[0]
        self.assertEqual((r.exercise, r.group, r.weight_kg, r.performed_at), ("Bench, wide", "CHEST", 62.5, t))
