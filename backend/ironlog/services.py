"""
Business rules. Mirrors `FitnessRepository.kt` in ironlog-android.

Every function takes the user explicitly and only touches that user's rows.
Operations spanning several tables run in a transaction.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .domain import history_csv, seed, strength
from .domain.share import SharedDay, SharedExercise, SharedPlan
from .models import (
    ActiveExercise, Exercise, Plan, PlanDay, PlanDayExercise, Profile, WorkoutEntry, WorkoutSession,
)

DEFAULT_WEIGHT = 20.0
DEFAULT_SETS = 4
DEFAULT_REPS = 12


class ServiceError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


# ======================================================
#  Accounts
# ======================================================

@transaction.atomic
def setup_new_user(user, language: str = "en") -> None:
    lang = "zh" if language.lower().startswith("zh") else "en"
    Profile.objects.create(user=user, language=lang)
    ids = {}
    for name, group in seed.EXERCISES[lang]:
        ids[name] = Exercise.objects.create(user=user, name=name, muscle_group=group).id
    plan_name, days = seed.PLAN[lang]
    plan = Plan.objects.create(user=user, name=plan_name)
    for i, (day_name, items) in enumerate(days):
        day = PlanDay.objects.create(plan=plan, name=day_name, sort_order=i)
        PlanDayExercise.objects.bulk_create([
            PlanDayExercise(day=day, exercise_id=ids[n], sets=s, reps=r, weight_kg=w, sort_order=j)
            for j, (n, s, r, w) in enumerate(items)
        ])
    _activate(user, plan)


def profile_of(user) -> Profile:
    profile, _ = Profile.objects.get_or_create(user=user)
    return profile


# ======================================================
#  Exercise library
# ======================================================

def obtain_exercise(user, name: str, group: str) -> Exercise:
    """Get an exercise by name, creating it if missing and un-archiving it if archived."""
    name = name.strip()[:60]
    existing = Exercise.objects.filter(user=user, name=name).first()
    if existing is None:
        return Exercise.objects.create(user=user, name=name, muscle_group=group)
    if existing.archived:
        existing.archived = False
        existing.save(update_fields=["archived"])
    return existing


def create_exercise(user, name: str, group: str) -> Exercise:
    name = name.strip()
    if not name:
        raise ServiceError("blank", "Name is required.")
    existing = Exercise.objects.filter(user=user, name=name).first()
    if existing and not existing.archived:
        raise ServiceError("duplicate", f'"{name}" already exists.')
    if existing:
        existing.archived = False
        existing.muscle_group = group
        existing.save()
        return existing
    return Exercise.objects.create(user=user, name=name, muscle_group=group)


def update_exercise(user, exercise: Exercise, name: str, group: str) -> Exercise:
    name = name.strip()
    if not name:
        raise ServiceError("blank", "Name is required.")
    if Exercise.objects.filter(user=user, name=name).exclude(id=exercise.id).exists():
        raise ServiceError("duplicate", f'"{name}" already exists.')
    exercise.name = name
    exercise.muscle_group = group
    exercise.save()
    return exercise


# ======================================================
#  Plans and days
# ======================================================

def _next_order(qs) -> int:
    return (qs.aggregate(m=Max("sort_order"))["m"] if qs.exists() else -1) + 1


def _active_plan(user) -> Plan | None:
    return Plan.objects.filter(user=user, is_active=True).first()


@transaction.atomic
def create_plan(user, name: str) -> Plan:
    plan = Plan.objects.create(user=user, name=name.strip()[:60], sort_order=_next_order(Plan.objects.filter(user=user)))
    day = PlanDay.objects.create(plan=plan, name="Day 1" if profile_of(user).language == "en" else "第 1 天")
    plan.current_day = day
    plan.save(update_fields=["current_day"])
    if _active_plan(user) is None:
        _activate(user, plan)
    return plan


@transaction.atomic
def delete_plan(user, plan: Plan) -> None:
    was_active = plan.is_active
    plan.delete()
    if was_active:
        ActiveExercise.objects.filter(user=user).delete()


@transaction.atomic
def activate_plan(user, plan: Plan) -> None:
    _activate(user, plan)


def _activate(user, plan: Plan) -> None:
    Plan.objects.filter(user=user).update(is_active=False)
    days = list(plan.days.all())
    day = next((d for d in days if d.id == plan.current_day_id), days[0] if days else None)
    plan.is_active = True
    plan.current_day = day
    plan.save(update_fields=["is_active", "current_day"])
    _load_day_into_active(user, day)


def reorder(model_qs, ordered_ids: list[int]) -> None:
    by_id = {o.id: o for o in model_qs}
    changed = []
    for i, oid in enumerate(ordered_ids):
        obj = by_id.get(oid)
        if obj is not None and obj.sort_order != i:
            obj.sort_order = i
            changed.append(obj)
    if changed:
        type(changed[0]).objects.bulk_update(changed, ["sort_order"])


@transaction.atomic
def add_day(user, plan: Plan, name: str) -> PlanDay:
    day = PlanDay.objects.create(plan=plan, name=name.strip()[:60], sort_order=_next_order(plan.days.all()))
    if plan.current_day_id is None:
        plan.current_day = day
        plan.save(update_fields=["current_day"])
        if plan.is_active:
            _load_day_into_active(user, day)
    return day


@transaction.atomic
def delete_day(user, day: PlanDay) -> None:
    plan = day.plan
    days = list(plan.days.all())
    idx = days.index(day)
    day.delete()
    if plan.current_day_id == day.id:
        remaining = [d for d in days if d.id != day.id]
        nxt = remaining[idx] if idx < len(remaining) else (remaining[0] if remaining else None)
        plan.current_day = nxt
        plan.save(update_fields=["current_day"])
        if plan.is_active:
            _load_day_into_active(user, nxt)


@transaction.atomic
def copy_day(user, day: PlanDay, target: Plan) -> PlanDay:
    names = set(target.days.values_list("name", flat=True))
    name = day.name if day.name not in names else f"{day.name} (copy)"
    new_day = PlanDay.objects.create(plan=target, name=name[:60], sort_order=_next_order(target.days.all()))
    PlanDayExercise.objects.bulk_create([
        PlanDayExercise(day=new_day, exercise_id=i.exercise_id, sets=i.sets, reps=i.reps,
                        weight_kg=i.weight_kg, sort_order=i.sort_order)
        for i in day.items.all()
    ])
    if target.current_day_id is None:
        target.current_day = new_day
        target.save(update_fields=["current_day"])
        if target.is_active:
            _load_day_into_active(user, new_day)
    return new_day


@transaction.atomic
def add_exercise_to_day(user, day: PlanDay, name: str, group: str, sets=DEFAULT_SETS, reps=DEFAULT_REPS,
                        weight_kg=DEFAULT_WEIGHT) -> PlanDayExercise:
    exercise = obtain_exercise(user, name, group)
    if day.items.filter(exercise=exercise).exists():
        raise ServiceError("duplicate", f'"{exercise.name}" is already in this day.')
    return PlanDayExercise.objects.create(day=day, exercise=exercise, sets=sets, reps=reps, weight_kg=weight_kg,
                                          sort_order=_next_order(day.items.all()))


# ---------- sharing ----------

def export_plan(plan: Plan, include_weights: bool) -> SharedPlan:
    days = []
    for day in plan.days.prefetch_related("items__exercise"):
        days.append(SharedDay(day.name, [
            SharedExercise(i.exercise.name, i.exercise.muscle_group, i.sets, i.reps,
                           i.weight_kg if include_weights else None)
            for i in day.items.all()
        ]))
    return SharedPlan(plan.name, days)


def unique_plan_name(user, name: str) -> str:
    taken = set(Plan.objects.filter(user=user).values_list("name", flat=True))
    if name not in taken:
        return name
    n = 2
    while f"{name} ({n})" in taken:
        n += 1
    return f"{name} ({n})"


def preview_plan_import(user, shared: SharedPlan) -> dict:
    known = set(Exercise.objects.filter(user=user, archived=False).values_list("name", flat=True))
    new = list(dict.fromkeys(e.name for d in shared.days for e in d.exercises if e.name not in known))
    return {"final_name": unique_plan_name(user, shared.name), "new_exercises": new}


@transaction.atomic
def import_plan(user, shared: SharedPlan) -> Plan:
    """Always added as a new plan; existing plans and history are untouched."""
    plan = Plan.objects.create(user=user, name=unique_plan_name(user, shared.name)[:60],
                               sort_order=_next_order(Plan.objects.filter(user=user)))
    first_day = None
    for i, sd in enumerate(shared.days):
        day = PlanDay.objects.create(plan=plan, name=sd.name, sort_order=i)
        first_day = first_day or day
        seen, items = set(), []
        for j, e in enumerate(sd.exercises):
            ex = obtain_exercise(user, e.name, e.group)
            if ex.id in seen:
                continue
            seen.add(ex.id)
            items.append(PlanDayExercise(day=day, exercise=ex, sets=e.sets, reps=e.reps,
                                         weight_kg=e.weight_kg or 0.0, sort_order=j))
        PlanDayExercise.objects.bulk_create(items)
    plan.current_day = first_day
    plan.save(update_fields=["current_day"])
    if _active_plan(user) is None:
        _activate(user, plan)
    return plan


# ======================================================
#  Today's workout
# ======================================================

def latest_entry(user, exercise_id: int) -> WorkoutEntry | None:
    return (WorkoutEntry.objects.filter(session__user=user, exercise_id=exercise_id)
            .order_by("-session__performed_at", "-id").first())


def _load_day_into_active(user, day: PlanDay | None) -> None:
    """Reset the board from a day's template, preferring the last actually-logged numbers per exercise."""
    ActiveExercise.objects.filter(user=user).delete()
    if day is None:
        return
    items = []
    for i, t in enumerate(day.items.all()):
        last = latest_entry(user, t.exercise_id)
        items.append(ActiveExercise(
            user=user, exercise_id=t.exercise_id,
            weight_kg=last.weight_kg if last else t.weight_kg,
            sets=last.sets if last else t.sets,
            reps=last.reps if last else t.reps,
            in_plan=True, sort_order=i,
        ))
    ActiveExercise.objects.bulk_create(items)


def _current_day(user) -> PlanDay | None:
    plan = _active_plan(user)
    return plan.current_day if plan else None


@transaction.atomic
def select_day(user, day: PlanDay) -> None:
    plan = day.plan
    plan.current_day = day
    plan.save(update_fields=["current_day"])
    if plan.is_active:
        _load_day_into_active(user, day)


@transaction.atomic
def reload_current_day(user) -> None:
    _load_day_into_active(user, _current_day(user))


@transaction.atomic
def add_active(user, name: str, group: str, add_to_plan: bool) -> ActiveExercise:
    exercise = obtain_exercise(user, name, group)
    last = latest_entry(user, exercise.id)
    day = _current_day(user)
    template = day.items.filter(exercise=exercise).first() if day else None
    weight = last.weight_kg if last else (template.weight_kg if template else DEFAULT_WEIGHT)
    sets = last.sets if last else (template.sets if template else DEFAULT_SETS)
    reps = last.reps if last else (template.reps if template else DEFAULT_REPS)
    if day and add_to_plan and template is None:
        PlanDayExercise.objects.create(day=day, exercise=exercise, sets=sets, reps=reps, weight_kg=weight,
                                       sort_order=_next_order(day.items.all()))
    return ActiveExercise.objects.create(
        user=user, exercise=exercise, weight_kg=weight, sets=sets, reps=reps,
        in_plan=template is not None or (add_to_plan and day is not None),
        sort_order=_next_order(ActiveExercise.objects.filter(user=user)),
    )


@transaction.atomic
def reorder_active(user, ordered_ids: list[int]) -> None:
    """Reorder the board; template exercises also update the template order for next time."""
    board = list(ActiveExercise.objects.filter(user=user))
    reorder(board, ordered_ids)
    day = _current_day(user)
    if not day:
        return
    by_id = {a.id: a for a in board}
    ordered = [by_id[i] for i in ordered_ids if i in by_id]
    templates = {t.exercise_id: t for t in day.items.all()}
    plan_order = [templates[a.exercise_id] for a in ordered if a.in_plan and a.exercise_id in templates]
    rest = sorted((t for t in templates.values() if t not in plan_order), key=lambda t: t.sort_order)
    reorder(plan_order + rest, [t.id for t in plan_order + rest])


@transaction.atomic
def set_in_plan(user, item: ActiveExercise, in_plan: bool) -> None:
    day = _current_day(user)
    if day is None:
        raise ServiceError("no_plan", "There is no active plan.")
    if in_plan:
        if not day.items.filter(exercise_id=item.exercise_id).exists():
            PlanDayExercise.objects.create(day=day, exercise_id=item.exercise_id, sets=item.sets, reps=item.reps,
                                           weight_kg=item.weight_kg, sort_order=_next_order(day.items.all()))
    else:
        day.items.filter(exercise_id=item.exercise_id).delete()
    item.in_plan = in_plan
    item.save(update_fields=["in_plan"])


@transaction.atomic
def replace_active(user, item: ActiveExercise, name: str, group: str) -> None:
    """Swap the card's exercise; if it belongs to the template, swap it there too."""
    new = obtain_exercise(user, name, group)
    if new.id == item.exercise_id:
        return
    day = _current_day(user)
    if item.in_plan and day:
        old_row = day.items.filter(exercise_id=item.exercise_id).first()
        clash = day.items.filter(exercise=new).exists()
        if old_row and not clash:
            old_row.exercise = new
            old_row.save(update_fields=["exercise"])
        elif old_row:
            old_row.delete()
    last = latest_entry(user, new.id)
    item.exercise = new
    if last:
        item.weight_kg, item.sets, item.reps = last.weight_kg, last.sets, last.reps
    item.save()


@transaction.atomic
def delete_active(user, item: ActiveExercise, remove_from_plan: bool) -> dict:
    """Returns a snapshot that `restore_active` can use to undo."""
    snapshot = {
        "exercise_id": item.exercise_id, "weight_kg": item.weight_kg, "sets": item.sets, "reps": item.reps,
        "completed": item.completed, "in_plan": item.in_plan, "sort_order": item.sort_order, "template": None,
    }
    day = _current_day(user)
    if remove_from_plan and day:
        row = day.items.filter(exercise_id=item.exercise_id).first()
        if row:
            snapshot["template"] = {"day_id": day.id, "sets": row.sets, "reps": row.reps,
                                    "weight_kg": row.weight_kg, "sort_order": row.sort_order}
            row.delete()
    item.delete()
    return snapshot


@transaction.atomic
def restore_active(user, snapshot: dict) -> None:
    exercise = Exercise.objects.get(user=user, id=snapshot["exercise_id"])
    ActiveExercise.objects.create(
        user=user, exercise=exercise, weight_kg=snapshot["weight_kg"], sets=snapshot["sets"],
        reps=snapshot["reps"], completed=snapshot["completed"], in_plan=snapshot["in_plan"],
        sort_order=snapshot["sort_order"],
    )
    t = snapshot.get("template")
    if t:
        day = PlanDay.objects.filter(id=t["day_id"], plan__user=user).first()
        if day and not day.items.filter(exercise=exercise).exists():
            PlanDayExercise.objects.create(day=day, exercise=exercise, sets=t["sets"], reps=t["reps"],
                                           weight_kg=t["weight_kg"], sort_order=t["sort_order"])


@transaction.atomic
def finish_workout(user, mark_all: bool, now: datetime | None = None) -> dict:
    """Archive completed (or all) cards, clear the board and advance to the next training day."""
    active = list(ActiveExercise.objects.filter(user=user))
    done = active if mark_all else [a for a in active if a.completed]
    if not done:
        return {"archived": 0, "next_day": None}
    plan = _active_plan(user)
    days = list(plan.days.all()) if plan else []
    current = next((d for d in days if d.id == plan.current_day_id), None) if plan else None
    session = WorkoutSession.objects.create(
        user=user, performed_at=now or timezone.now(),
        plan_name=plan.name if plan else None, day_name=current.name if current else None,
    )
    WorkoutEntry.objects.bulk_create([
        WorkoutEntry(session=session, exercise_id=a.exercise_id, weight_kg=a.weight_kg, sets=a.sets,
                     reps=a.reps, sort_order=i)
        for i, a in enumerate(done)
    ])
    next_day = None
    if plan and days:
        idx = days.index(current) if current in days else -1
        next_day = days[(idx + 1) % len(days)]
        plan.current_day = next_day
        plan.save(update_fields=["current_day"])
        _load_day_into_active(user, next_day)
    else:
        ActiveExercise.objects.filter(user=user).delete()
    return {"archived": len(done), "next_day": next_day.name if next_day else None}


# ======================================================
#  History
# ======================================================

@transaction.atomic
def delete_entry(user, entry: WorkoutEntry) -> None:
    session = entry.session
    entry.delete()
    if not session.entries.exists():
        session.delete()


@transaction.atomic
def add_manual_entry(user, performed_at: datetime, day_name: str, name: str, group: str,
                     weight_kg: float, sets: int, reps: int) -> WorkoutSession:
    exercise = obtain_exercise(user, name, group)
    session = WorkoutSession.objects.create(user=user, performed_at=performed_at, plan_name="Manual entry",
                                            day_name=day_name.strip() or None)
    WorkoutEntry.objects.create(session=session, exercise=exercise, weight_kg=weight_kg, sets=sets, reps=reps)
    return session


def export_history_csv(user, tz: ZoneInfo) -> str:
    rows = (WorkoutEntry.objects.filter(session__user=user)
            .select_related("session", "exercise").order_by("session__performed_at", "sort_order", "id"))
    return history_csv.export(
        ((e.session.performed_at, e.session.plan_name, e.session.day_name, e.exercise.name,
          e.exercise.muscle_group, e.weight_kg, e.sets, e.reps) for e in rows),
        tz,
    )


def plan_history_import(user, text: str, tz: ZoneInfo) -> history_csv.ImportPlan:
    parsed = history_csv.parse(text, tz)
    existing = [
        history_csv.dedupe_key(e.session.performed_at.astimezone(tz), e.exercise.name, e.weight_kg, e.sets, e.reps)
        for e in WorkoutEntry.objects.filter(session__user=user).select_related("session", "exercise")
    ]
    known = set(Exercise.objects.filter(user=user, archived=False).values_list("name", flat=True))
    return history_csv.plan(parsed, existing, known, tz)


@transaction.atomic
def apply_history_import(user, plan: history_csv.ImportPlan) -> None:
    for rows in plan.sessions:
        first = rows[0]
        session = WorkoutSession.objects.create(
            user=user, performed_at=min(r.performed_at for r in rows),
            plan_name=first.plan_name or "Imported", day_name=first.day_name,
        )
        WorkoutEntry.objects.bulk_create([
            WorkoutEntry(session=session,
                         exercise=obtain_exercise(user, r.exercise, r.group or history_csv.guess_group(r.exercise)),
                         weight_kg=r.weight_kg, sets=r.sets, reps=r.reps, sort_order=i)
            for i, r in enumerate(rows)
        ])


# ======================================================
#  Analytics
# ======================================================

@dataclass
class StatsSummary:
    report: strength.StrengthReport | None
    session_count: int
    sessions_last_30_days: int
    total_volume_kg: float


def stats(user, mode: strength.RadarMode, now: datetime | None = None) -> StatsSummary:
    now = now or timezone.now()
    profile = profile_of(user)
    entries = list(WorkoutEntry.objects.filter(session__user=user).select_related("session", "exercise"))
    lifts = [strength.Lift(e.exercise_id, e.exercise.name, e.exercise.muscle_group, e.weight_kg, e.reps, e.sets,
                           e.session.performed_at) for e in entries]
    report = strength.analyze(lifts, mode, profile.body_weight_kg, profile.ape_index, now) if lifts else None
    sessions = WorkoutSession.objects.filter(user=user)
    return StatsSummary(
        report=report,
        session_count=sessions.count(),
        sessions_last_30_days=sessions.filter(performed_at__gte=now - timedelta(days=30)).count(),
        total_volume_kg=sum(e.weight_kg * e.sets * e.reps for e in entries),
    )
