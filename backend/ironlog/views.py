"""
REST API. Thin layer: validate input, look up the user's own objects, call `services`, shape the output.
"""
from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Prefetch
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.authentication import CSRFCheck
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from . import serializers as S
from . import services
from .domain import history_csv, share, strength
from .models import ActiveExercise, Exercise, Plan, PlanDay, PlanDayExercise, WorkoutEntry, WorkoutSession


def _valid(serializer_cls, request, partial=False):
    s = serializer_cls(data=request.data, partial=partial)
    s.is_valid(raise_exception=True)
    return s.validated_data


def _error(code: str, message: str, http=status.HTTP_400_BAD_REQUEST):
    return Response({"code": code, "detail": message}, status=http)


def _tz(request) -> ZoneInfo:
    """The browser sends its IANA time zone so dates in CSV files mean the user's local day."""
    try:
        return ZoneInfo(request.headers.get("X-Timezone") or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _enforce_csrf(request):
    """
    DRF only checks CSRF for already-authenticated sessions. Login/register/logout are called anonymously,
    so check explicitly to block login CSRF (a third-party site logging the browser into another account).
    """
    check = CSRFCheck(lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise PermissionDenied(f"CSRF failed: {reason}")


class AuthThrottle(SimpleRateThrottle):
    """Limit login/register attempts per client IP."""

    scope = "auth"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


# ======================================================
#  Auth & profile
# ======================================================

def _me(user):
    return {"user": {"username": user.username}, "profile": S.profile_out(services.profile_of(user))}


@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def me(request):
    if not request.user.is_authenticated:
        return Response({"user": None})
    return Response(_me(request.user))


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def register(request):
    _enforce_csrf(request)
    data = _valid(S.CredentialsIn, request)
    username = data["username"].strip()
    if User.objects.filter(username__iexact=username).exists():
        return _error("username_taken", "That username is taken.")
    try:
        validate_password(data["password"], User(username=username))
    except ValidationError as e:
        return _error("weak_password", " ".join(e.messages))
    with transaction.atomic():
        user = User.objects.create_user(username=username, password=data["password"])
        services.setup_new_user(user, data.get("language", "en"))
    login(request, user)
    return Response(_me(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
def login_view(request):
    _enforce_csrf(request)
    data = _valid(S.CredentialsIn, request)
    user = authenticate(request, username=data["username"].strip(), password=data["password"])
    if user is None:
        return _error("bad_credentials", "Incorrect username or password.", status.HTTP_401_UNAUTHORIZED)
    login(request, user)
    return Response(_me(user))


@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    _enforce_csrf(request)
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "PATCH"])
def profile(request):
    p = services.profile_of(request.user)
    if request.method == "PATCH":
        for k, v in _valid(S.ProfileIn, request, partial=True).items():
            setattr(p, k, v)
        p.save()
    return Response(S.profile_out(p))


# ======================================================
#  Exercise library
# ======================================================

@api_view(["GET", "POST"])
def exercises(request):
    if request.method == "POST":
        d = _valid(S.ExerciseIn, request)
        try:
            e = services.create_exercise(request.user, d["name"], d["muscle_group"])
        except services.ServiceError as err:
            return _error(err.code, str(err))
        return Response(S.exercise_out(e), status=status.HTTP_201_CREATED)
    qs = Exercise.objects.filter(user=request.user, archived=False)
    return Response([S.exercise_out(e) for e in qs])


@api_view(["PATCH", "DELETE"])
def exercise_detail(request, pk):
    e = get_object_or_404(Exercise, pk=pk, user=request.user)
    if request.method == "DELETE":
        e.archived = True
        e.save(update_fields=["archived"])
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = _valid(S.ExerciseIn, request)
    try:
        services.update_exercise(request.user, e, d["name"], d["muscle_group"])
    except services.ServiceError as err:
        return _error(err.code, str(err))
    return Response(S.exercise_out(e))


@api_view(["GET"])
def exercise_trend(request, pk):
    get_object_or_404(Exercise, pk=pk, user=request.user)
    limit = min(int(request.query_params.get("limit", 10)), 50)
    entries = (WorkoutEntry.objects.filter(session__user=request.user, exercise_id=pk)
               .select_related("session").order_by("-session__performed_at", "-id")[:limit])
    return Response([{"performed_at": e.session.performed_at.isoformat(), "weight_kg": e.weight_kg,
                      "sets": e.sets, "reps": e.reps} for e in reversed(list(entries))])


# ======================================================
#  Plans
# ======================================================

def _plans_payload(user):
    plans = Plan.objects.filter(user=user).prefetch_related(
        Prefetch("days", queryset=PlanDay.objects.annotate(exercise_count=Count("items")))
    )
    return [{
        "id": p.id, "name": p.name, "is_active": p.is_active, "current_day_id": p.current_day_id,
        "days": [{"id": d.id, "name": d.name, "exercise_count": d.exercise_count} for d in p.days.all()],
    } for p in plans]


@api_view(["GET", "POST"])
def plans(request):
    if request.method == "POST":
        services.create_plan(request.user, _valid(S.NameIn, request)["name"])
    return Response(_plans_payload(request.user))


@api_view(["PATCH", "DELETE"])
def plan_detail(request, pk):
    plan = get_object_or_404(Plan, pk=pk, user=request.user)
    if request.method == "DELETE":
        services.delete_plan(request.user, plan)
    else:
        plan.name = _valid(S.NameIn, request)["name"].strip()
        plan.save(update_fields=["name"])
    return Response(_plans_payload(request.user))


@api_view(["POST"])
def plan_activate(request, pk):
    services.activate_plan(request.user, get_object_or_404(Plan, pk=pk, user=request.user))
    return Response(_plans_payload(request.user))


@api_view(["POST"])
def plans_reorder(request):
    services.reorder(Plan.objects.filter(user=request.user), _valid(S.IdsIn, request)["ids"])
    return Response(_plans_payload(request.user))


@api_view(["POST"])
def plan_days(request, pk):
    plan = get_object_or_404(Plan, pk=pk, user=request.user)
    services.add_day(request.user, plan, _valid(S.NameIn, request)["name"])
    return Response(_plans_payload(request.user))


@api_view(["POST"])
def plan_days_reorder(request, pk):
    plan = get_object_or_404(Plan, pk=pk, user=request.user)
    services.reorder(plan.days.all(), _valid(S.IdsIn, request)["ids"])
    return Response(_plans_payload(request.user))


def _day_payload(day):
    return {"id": day.id, "name": day.name, "plan_id": day.plan_id,
            "items": [S.day_item_out(i) for i in day.items.select_related("exercise")]}


@api_view(["GET", "PATCH", "DELETE"])
def day_detail(request, pk):
    day = get_object_or_404(PlanDay, pk=pk, plan__user=request.user)
    if request.method == "DELETE":
        services.delete_day(request.user, day)
        return Response(_plans_payload(request.user))
    if request.method == "PATCH":
        day.name = _valid(S.NameIn, request)["name"].strip()
        day.save(update_fields=["name"])
    return Response(_day_payload(day))


@api_view(["POST"])
def day_copy(request, pk):
    day = get_object_or_404(PlanDay, pk=pk, plan__user=request.user)
    target = get_object_or_404(Plan, pk=request.data.get("target_plan_id"), user=request.user)
    services.copy_day(request.user, day, target)
    return Response(_plans_payload(request.user))


@api_view(["POST"])
def day_items(request, pk):
    day = get_object_or_404(PlanDay, pk=pk, plan__user=request.user)
    d = _valid(S.DayItemIn, request)
    try:
        services.add_exercise_to_day(request.user, day, d["name"], d["muscle_group"], d["sets"], d["reps"],
                                     d["weight_kg"])
    except services.ServiceError as err:
        return _error(err.code, str(err))
    return Response(_day_payload(day), status=status.HTTP_201_CREATED)


@api_view(["POST"])
def day_items_reorder(request, pk):
    day = get_object_or_404(PlanDay, pk=pk, plan__user=request.user)
    services.reorder(day.items.all(), _valid(S.IdsIn, request)["ids"])
    return Response(_day_payload(day))


@api_view(["PATCH", "DELETE"])
def day_item_detail(request, pk):
    item = get_object_or_404(PlanDayExercise, pk=pk, day__plan__user=request.user)
    day = item.day
    if request.method == "DELETE":
        item.delete()
    else:
        for k, v in _valid(S.SetValuesIn, request, partial=True).items():
            setattr(item, k, v)
        item.save()
    return Response(_day_payload(day))


# ---------- sharing ----------

@api_view(["GET"])
def plan_share(request, pk):
    plan = get_object_or_404(Plan, pk=pk, user=request.user)
    shared = services.export_plan(plan, request.query_params.get("weights") in {"1", "true"})
    return Response({
        "plan": S.shared_plan_out(shared), "code": share.encode(shared), "text": share.share_text(shared),
        "file_name": share.file_name(shared),
    })


def _decode_shared(request):
    try:
        return share.decode(_valid(S.TextIn, request)["text"]), None
    except share.ShareError as e:
        return None, _error(e.code, str(e))


@api_view(["POST"])
def plan_import_preview(request):
    shared, err = _decode_shared(request)
    if err:
        return err
    return Response({"plan": S.shared_plan_out(shared), **services.preview_plan_import(request.user, shared)})


@api_view(["POST"])
def plan_import(request):
    shared, err = _decode_shared(request)
    if err:
        return err
    plan = services.import_plan(request.user, shared)
    return Response({"plan_id": plan.id, "name": plan.name, "is_active": plan.is_active,
                     "plans": _plans_payload(request.user)}, status=status.HTTP_201_CREATED)


# ======================================================
#  Today's workout
# ======================================================

def _workout_payload(user):
    plan = Plan.objects.filter(user=user, is_active=True).first()
    days = list(plan.days.all()) if plan else []
    items = ActiveExercise.objects.filter(user=user).select_related("exercise")
    return {
        "plan": {"id": plan.id, "name": plan.name} if plan else None,
        "days": [{"id": d.id, "name": d.name} for d in days],
        "current_day_id": plan.current_day_id if plan else None,
        "items": [S.active_out(a) for a in items],
    }


@api_view(["GET"])
def workout(request):
    return Response(_workout_payload(request.user))


@api_view(["POST"])
def workout_items(request):
    d = _valid(S.AddActiveIn, request)
    services.add_active(request.user, d["name"], d["muscle_group"], d["add_to_plan"])
    return Response(_workout_payload(request.user), status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
def workout_item(request, pk):
    item = get_object_or_404(ActiveExercise, pk=pk, user=request.user)
    if request.method == "DELETE":
        snapshot = services.delete_active(request.user, item, request.query_params.get("remove_from_plan") == "1")
        return Response({**_workout_payload(request.user), "undo": snapshot})
    for k, v in _valid(S.ActiveUpdateIn, request, partial=True).items():
        setattr(item, k, v)
    item.save()
    return Response(_workout_payload(request.user))


@api_view(["POST"])
def workout_item_in_plan(request, pk):
    item = get_object_or_404(ActiveExercise, pk=pk, user=request.user)
    try:
        services.set_in_plan(request.user, item, bool(request.data.get("in_plan")))
    except services.ServiceError as err:
        return _error(err.code, str(err))
    return Response(_workout_payload(request.user))


@api_view(["POST"])
def workout_item_replace(request, pk):
    item = get_object_or_404(ActiveExercise, pk=pk, user=request.user)
    d = _valid(S.ExerciseIn, request)
    services.replace_active(request.user, item, d["name"], d["muscle_group"])
    return Response(_workout_payload(request.user))


@api_view(["POST"])
def workout_restore(request):
    snapshot = request.data.get("undo")
    if not isinstance(snapshot, dict):
        return _error("invalid", "Nothing to restore.")
    try:
        services.restore_active(request.user, snapshot)
    except (Exercise.DoesNotExist, KeyError, TypeError):
        return _error("invalid", "Nothing to restore.")
    return Response(_workout_payload(request.user))


@api_view(["POST"])
def workout_reorder(request):
    services.reorder_active(request.user, _valid(S.IdsIn, request)["ids"])
    return Response(_workout_payload(request.user))


@api_view(["POST"])
def workout_select_day(request):
    day = get_object_or_404(PlanDay, pk=request.data.get("day_id"), plan__user=request.user)
    services.select_day(request.user, day)
    return Response(_workout_payload(request.user))


@api_view(["POST"])
def workout_reload(request):
    services.reload_current_day(request.user)
    return Response(_workout_payload(request.user))


@api_view(["POST"])
def workout_finish(request):
    result = services.finish_workout(request.user, bool(request.data.get("mark_all")))
    return Response({**result, **_workout_payload(request.user)})


# ======================================================
#  History
# ======================================================

PAGE_SIZE = 20


@api_view(["GET", "DELETE"])
def history(request):
    if request.method == "DELETE":
        WorkoutSession.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    page = max(int(request.query_params.get("page", 1)), 1)
    qs = WorkoutSession.objects.filter(user=request.user).prefetch_related(
        Prefetch("entries", queryset=WorkoutEntry.objects.select_related("exercise")))
    total = qs.count()
    sessions = qs[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]
    return Response({"total": total, "page": page, "page_size": PAGE_SIZE,
                     "sessions": [S.session_out(s) for s in sessions]})


@api_view(["PATCH", "DELETE"])
def history_session(request, pk):
    s = get_object_or_404(WorkoutSession, pk=pk, user=request.user)
    if request.method == "DELETE":
        s.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    s.day_name = (request.data.get("day_name") or "").strip()[:60] or None
    s.save(update_fields=["day_name"])
    return Response(S.session_out(s))


@api_view(["PATCH", "DELETE"])
def history_entry(request, pk):
    e = get_object_or_404(WorkoutEntry, pk=pk, session__user=request.user)
    if request.method == "DELETE":
        services.delete_entry(request.user, e)
        return Response(status=status.HTTP_204_NO_CONTENT)
    for k, v in _valid(S.SetValuesIn, request, partial=True).items():
        setattr(e, k, v)
    e.save()
    return Response(S.entry_out(e))


@api_view(["POST"])
def history_manual(request):
    d = _valid(S.ManualEntryIn, request)
    s = services.add_manual_entry(request.user, d["performed_at"], d["day_name"], d["name"], d["muscle_group"],
                                  d["weight_kg"], d["sets"], d["reps"])
    return Response(S.session_out(s), status=status.HTTP_201_CREATED)


def _csv_response(text: str, filename: str):
    resp = HttpResponse("﻿" + text, content_type="text/csv; charset=utf-8")  # BOM: Excel opens UTF-8 correctly
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@api_view(["GET"])
def history_export(request):
    return _csv_response(services.export_history_csv(request.user, _tz(request)), "ironlog_history.csv")


@api_view(["GET"])
def history_template(request):
    return _csv_response(history_csv.template(), "ironlog_import_template.csv")


@api_view(["GET"])
def history_ai_prompt(request):
    return Response({"prompt": history_csv.AI_PROMPT})


def _import_payload(plan: history_csv.ImportPlan):
    rows = [r for s in plan.sessions for r in s]
    return {
        "sessions": len(plan.sessions), "entries": plan.entry_count, "duplicates": plan.duplicates,
        "new_exercises": plan.new_exercises,
        "issues": [{"line": i.line, "message": i.message} for i in plan.issues],
        "first_date": min(r.performed_at for r in rows).isoformat() if rows else None,
        "last_date": max(r.performed_at for r in rows).isoformat() if rows else None,
    }


@api_view(["POST"])
def history_import_preview(request):
    plan = services.plan_history_import(request.user, _valid(S.TextIn, request)["text"], _tz(request))
    return Response(_import_payload(plan))


@api_view(["POST"])
def history_import(request):
    plan = services.plan_history_import(request.user, _valid(S.TextIn, request)["text"], _tz(request))
    services.apply_history_import(request.user, plan)
    return Response(_import_payload(plan), status=status.HTTP_201_CREATED)


# ======================================================
#  Analytics
# ======================================================

@api_view(["GET"])
def stats(request):
    try:
        mode = strength.RadarMode[request.query_params.get("mode", "OVERALL").upper()]
    except KeyError:
        mode = strength.RadarMode.OVERALL
    s = services.stats(request.user, mode)
    r = s.report
    return Response({
        "mode": mode.name,
        "rep_range": [mode.value.start, mode.value.stop - 1],
        "session_count": s.session_count,
        "sessions_last_30_days": s.sessions_last_30_days,
        "total_volume_kg": s.total_volume_kg,
        "report": None if r is None else {
            "scores": r.scores,
            "recent_only": r.recent_only,
            "recent_days": strength.RECENT_DAYS,
            "distribution": {"strength": r.distribution.strength, "hypertrophy": r.distribution.hypertrophy,
                             "endurance": r.distribution.endurance},
            "best_lifts": [{"name": b.name, "group": b.group, "estimated_1rm_kg": b.estimated_1rm_kg}
                           for b in r.best_lifts],
        },
    })
