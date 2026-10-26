"""Input validation and JSON output shapes for the API."""
from rest_framework import serializers

from .models import MuscleGroup, WeightUnit

GROUPS = [c for c, _ in MuscleGroup.choices]


# ---------------- input ----------------

class CredentialsIn(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    language = serializers.CharField(max_length=5, required=False, default="en")


class ProfileIn(serializers.Serializer):
    unit = serializers.ChoiceField(choices=[c for c, _ in WeightUnit.choices], required=False)
    add_to_plan_by_default = serializers.BooleanField(required=False)
    height_cm = serializers.FloatField(min_value=0, max_value=250, required=False)
    wingspan_cm = serializers.FloatField(min_value=0, max_value=260, required=False)
    body_weight_kg = serializers.FloatField(min_value=0, max_value=300, required=False)
    language = serializers.ChoiceField(choices=["en", "zh"], required=False)


class ExerciseIn(serializers.Serializer):
    name = serializers.CharField(max_length=60)
    muscle_group = serializers.ChoiceField(choices=GROUPS, default="OTHER")


class NameIn(serializers.Serializer):
    name = serializers.CharField(max_length=60)


class IdsIn(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), max_length=500)


class SetValuesIn(serializers.Serializer):
    weight_kg = serializers.FloatField(min_value=0, max_value=1000, required=False)
    sets = serializers.IntegerField(min_value=1, max_value=99, required=False)
    reps = serializers.IntegerField(min_value=1, max_value=999, required=False)


class ActiveUpdateIn(SetValuesIn):
    completed = serializers.BooleanField(required=False)


class DayItemIn(ExerciseIn):
    sets = serializers.IntegerField(min_value=1, max_value=99, default=4)
    reps = serializers.IntegerField(min_value=1, max_value=999, default=12)
    weight_kg = serializers.FloatField(min_value=0, max_value=1000, default=20)


class AddActiveIn(ExerciseIn):
    add_to_plan = serializers.BooleanField(default=True)


class ManualEntryIn(ExerciseIn):
    performed_at = serializers.DateTimeField()
    day_name = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    weight_kg = serializers.FloatField(min_value=0, max_value=1000)
    sets = serializers.IntegerField(min_value=1, max_value=99)
    reps = serializers.IntegerField(min_value=1, max_value=999)


class TextIn(serializers.Serializer):
    text = serializers.CharField(max_length=2_000_000, trim_whitespace=False)


# ---------------- output ----------------

def exercise_out(e):
    return {"id": e.id, "name": e.name, "muscle_group": e.muscle_group}


def profile_out(p):
    return {
        "unit": p.unit, "add_to_plan_by_default": p.add_to_plan_by_default, "height_cm": p.height_cm,
        "wingspan_cm": p.wingspan_cm, "body_weight_kg": p.body_weight_kg, "language": p.language,
        "ape_index": round(p.ape_index, 3),
    }


def day_item_out(i):
    return {"id": i.id, "exercise": exercise_out(i.exercise), "sets": i.sets, "reps": i.reps,
            "weight_kg": i.weight_kg, "sort_order": i.sort_order}


def active_out(a):
    return {"id": a.id, "exercise": exercise_out(a.exercise), "weight_kg": a.weight_kg, "sets": a.sets,
            "reps": a.reps, "completed": a.completed, "in_plan": a.in_plan}


def entry_out(e):
    return {"id": e.id, "exercise": exercise_out(e.exercise), "weight_kg": e.weight_kg, "sets": e.sets,
            "reps": e.reps}


def session_out(s):
    entries = list(s.entries.all())
    return {
        "id": s.id, "performed_at": s.performed_at.isoformat(), "plan_name": s.plan_name, "day_name": s.day_name,
        "entries": [entry_out(e) for e in entries],
        "volume_kg": sum(e.weight_kg * e.sets * e.reps for e in entries),
    }


def shared_plan_out(plan):
    from .domain.share import to_json
    return {**to_json(plan), "exercise_count": plan.exercise_count, "includes_weights": plan.includes_weights}
