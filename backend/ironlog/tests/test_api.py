"""API tests: the main flows end to end, plus user isolation and CSRF."""
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from ironlog.domain import share
from ironlog.models import Exercise, WorkoutSession
from ironlog.tests.test_domain import ANDROID_CODE


class ApiTestCase(TestCase):
    def setUp(self):
        cache.clear()  # the login rate limit is per IP and would otherwise trip across tests
        self.client = APIClient()
        r = self.client.post("/api/auth/register", {"username": "alice", "password": "squat-heavy-2026"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def get(self, url, **kw):
        r = self.client.get(url, **kw)
        self.assertLess(r.status_code, 300, r.content)
        return r.json()

    def post(self, url, data=None, expect=None):
        r = self.client.post(url, data or {}, format="json")
        if expect:
            self.assertEqual(r.status_code, expect, r.content)
        else:
            self.assertLess(r.status_code, 300, r.content)
        return r.json() if r.content else None


class AuthTests(ApiTestCase):
    def test_register_seeds_library_and_active_plan(self):
        me = self.get("/api/auth/me")
        self.assertEqual(me["user"]["username"], "alice")
        self.assertGreater(len(self.get("/api/exercises")), 20)
        w = self.get("/api/workout")
        self.assertEqual(w["plan"]["name"], "Push Pull Legs")
        self.assertEqual(len(w["items"]), 5)

    def test_chinese_seed(self):
        c = APIClient()
        c.post("/api/auth/register", {"username": "bo", "password": "squat-heavy-2026", "language": "zh-CN"},
               format="json")
        self.assertEqual(c.get("/api/workout").json()["plan"]["name"], "经典推拉腿 (PPL)")

    def test_duplicate_username_and_weak_password(self):
        c = APIClient()
        r = c.post("/api/auth/register", {"username": "ALICE", "password": "squat-heavy-2026"}, format="json")
        self.assertEqual(r.json()["code"], "username_taken")
        r = c.post("/api/auth/register", {"username": "carol", "password": "123"}, format="json")
        self.assertEqual(r.json()["code"], "weak_password")

    def test_login_logout(self):
        self.post("/api/auth/logout")
        self.assertIsNone(self.get("/api/auth/me")["user"])
        self.assertEqual(self.client.get("/api/workout").status_code, 403)
        r = self.client.post("/api/auth/login", {"username": "alice", "password": "wrong"}, format="json")
        self.assertEqual(r.status_code, 401)
        self.post("/api/auth/login", {"username": "alice", "password": "squat-heavy-2026"})
        self.assertEqual(self.get("/api/auth/me")["user"]["username"], "alice")

    def test_csrf_enforced_for_session_clients(self):
        c = APIClient(enforce_csrf_checks=True)
        c.get("/api/auth/me")
        token = c.cookies["csrftoken"].value
        self.assertEqual(c.post("/api/auth/login", {"username": "alice", "password": "squat-heavy-2026"},
                                format="json").status_code, 403)
        r = c.post("/api/auth/login", {"username": "alice", "password": "squat-heavy-2026"}, format="json",
                   HTTP_X_CSRFTOKEN=token)
        self.assertEqual(r.status_code, 200)


class WorkoutTests(ApiTestCase):
    def test_finish_archives_and_advances_day(self):
        w = self.get("/api/workout")
        first, second = w["items"][0], w["items"][1]
        self.client.patch(f"/api/workout/items/{first['id']}", {"completed": True, "weight_kg": 42.5}, format="json")
        r = self.post("/api/workout/finish", {"mark_all": False})
        self.assertEqual(r["archived"], 1)
        self.assertEqual(r["next_day"], "Pull")
        self.assertEqual(r["current_day_id"], w["days"][1]["id"])
        h = self.get("/api/history")
        self.assertEqual(h["total"], 1)
        self.assertEqual(h["sessions"][0]["day_name"], "Push")
        self.assertEqual(h["sessions"][0]["entries"][0]["weight_kg"], 42.5)
        # back on Push day, the last logged weight is reused
        r = self.post("/api/workout/select-day", {"day_id": w["days"][0]["id"]})
        self.assertEqual(r["items"][0]["weight_kg"], 42.5)
        self.assertNotEqual(second["id"], None)

    def test_nothing_completed_archives_nothing(self):
        self.assertEqual(self.post("/api/workout/finish", {"mark_all": False})["archived"], 0)
        self.assertEqual(WorkoutSession.objects.count(), 0)

    def test_add_temporary_and_delete_with_undo(self):
        w = self.post("/api/workout/items", {"name": "Zercher Squat", "muscle_group": "LEGS", "add_to_plan": False})
        item = w["items"][-1]
        self.assertFalse(item["in_plan"])
        r = self.client.delete(f"/api/workout/items/{item['id']}")
        undo = r.json()["undo"]
        self.assertEqual(len(r.json()["items"]), 5)
        w = self.post("/api/workout/items/restore", {"undo": undo})
        self.assertEqual(w["items"][-1]["exercise"]["name"], "Zercher Squat")

    def test_remove_from_template(self):
        w = self.get("/api/workout")
        item = w["items"][0]
        self.client.delete(f"/api/workout/items/{item['id']}?remove_from_plan=1")
        day = self.get(f"/api/days/{w['current_day_id']}")
        self.assertNotIn(item["exercise"]["name"], [i["exercise"]["name"] for i in day["items"]])

    def test_reorder_updates_template(self):
        w = self.get("/api/workout")
        ids = [i["id"] for i in w["items"]][::-1]
        w = self.post("/api/workout/reorder", {"ids": ids})
        day = self.get(f"/api/days/{w['current_day_id']}")
        self.assertEqual([i["exercise"]["name"] for i in day["items"]],
                         [i["exercise"]["name"] for i in w["items"]])


class PlanShareTests(ApiTestCase):
    def test_share_and_import_round_trip(self):
        plan_id = self.get("/api/plans")[0]["id"]
        s = self.get(f"/api/plans/{plan_id}/share?weights=1")
        self.assertTrue(s["code"].startswith("FP1:"))
        self.assertTrue(s["plan"]["includes_weights"])
        preview = self.post("/api/plans/import/preview", {"text": s["text"]})
        self.assertEqual(preview["final_name"], "Push Pull Legs (2)")
        self.assertEqual(preview["new_exercises"], [])
        r = self.post("/api/plans/import", {"text": s["code"]}, expect=201)
        self.assertFalse(r["is_active"])
        self.assertEqual(len(r["plans"]), 2)

    def test_import_android_code(self):
        preview = self.post("/api/plans/import/preview", {"text": ANDROID_CODE})
        self.assertEqual(preview["plan"]["name"], "推拉腿 PPL")
        self.assertEqual(len(preview["new_exercises"]), 3)
        self.post("/api/plans/import", {"text": ANDROID_CODE}, expect=201)
        self.assertTrue(Exercise.objects.filter(name="杠铃深蹲", muscle_group="LEGS").exists())

    def test_bad_code(self):
        r = self.client.post("/api/plans/import/preview", {"text": "nothing here"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["code"], "not_found")


class HistoryTests(ApiTestCase):
    CSV = ("date,plan,day,exercise,muscle_group,weight_kg,sets,reps\n"
           "2025-12-01 06:40,Trial,Chest A,Incline Dumbbell Press,Chest,10,3,6\n"
           "2025-12-01 06:40,Trial,Chest A,Butterfly Machine,Chest,32,3,12\n"
           "2025-12-01 06:50,Trial,Chest A,Incline Dumbbell Press,Chest,12,3,6\n"
           "last friday,Trial,Arms,Curl,Arms,12,3,12\n")

    def test_import_preview_then_apply_then_dedupe(self):
        p = self.post("/api/history/import/preview", {"text": self.CSV})
        self.assertEqual((p["sessions"], p["entries"], len(p["issues"])), (2, 3, 1))
        self.assertEqual(p["new_exercises"], ["Butterfly Machine"])
        self.post("/api/history/import", {"text": self.CSV}, expect=201)
        again = self.post("/api/history/import/preview", {"text": self.CSV})
        self.assertEqual((again["entries"], again["duplicates"]), (0, 3))

    def test_export_reimports_cleanly(self):
        self.post("/api/history/import", {"text": self.CSV}, expect=201)
        csv = self.client.get("/api/history/export.csv").content.decode("utf-8-sig")
        self.assertTrue(csv.startswith("date,plan,day,exercise"))
        self.assertEqual(self.post("/api/history/import/preview", {"text": csv})["duplicates"], 3)

    def test_edit_and_delete_entries(self):
        self.post("/api/history/import", {"text": self.CSV}, expect=201)
        session = self.get("/api/history")["sessions"][-1]
        entry = session["entries"][0]
        r = self.client.patch(f"/api/history/entries/{entry['id']}", {"reps": 7}, format="json")
        self.assertEqual(r.json()["reps"], 7)
        for e in session["entries"]:
            self.client.delete(f"/api/history/entries/{e['id']}")
        self.assertEqual(self.get("/api/history")["total"], 1)  # empty session removed

    def test_stats(self):
        self.assertIsNone(self.get("/api/stats")["report"])
        self.post("/api/history/import", {"text": self.CSV}, expect=201)
        s = self.get("/api/stats?mode=STRENGTH")
        self.assertEqual(s["rep_range"], [1, 6])
        self.assertGreater(s["report"]["scores"]["CHEST"], 0)


class IsolationTests(ApiTestCase):
    def test_users_cannot_touch_each_others_data(self):
        alice_plan = self.get("/api/plans")[0]["id"]
        alice_ex = self.get("/api/exercises")[0]["id"]
        bob = APIClient()
        bob.post("/api/auth/register", {"username": "bob", "password": "deadlift-2026!"}, format="json")
        self.assertEqual(bob.get(f"/api/plans/{alice_plan}/share").status_code, 404)
        self.assertEqual(bob.delete(f"/api/exercises/{alice_ex}").status_code, 404)
        self.assertEqual(bob.post(f"/api/plans/{alice_plan}/activate").status_code, 404)
        self.assertFalse(Exercise.objects.get(id=alice_ex).archived)
        self.assertEqual(User.objects.count(), 2)
