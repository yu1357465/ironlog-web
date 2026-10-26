"""
Data model. Mirrors the Android app (ironlog-android) so that plan share codes and
CSV history move between the two without translation.

Weights are always stored in kilograms; the UI converts for display.
"""
from django.conf import settings
from django.db import models


class MuscleGroup(models.TextChoices):
    CHEST = "CHEST", "Chest"
    BACK = "BACK", "Back"
    LEGS = "LEGS", "Legs & glutes"
    SHOULDERS = "SHOULDERS", "Shoulders"
    ARMS = "ARMS", "Arms"
    CORE = "CORE", "Core"
    OTHER = "OTHER", "Other"


RADAR_GROUPS = [
    MuscleGroup.CHEST, MuscleGroup.BACK, MuscleGroup.LEGS,
    MuscleGroup.SHOULDERS, MuscleGroup.ARMS, MuscleGroup.CORE,
]


class Exercise(models.Model):
    """Each user has their own library, so renaming or archiving never affects anyone else."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="exercises")
    name = models.CharField(max_length=60)
    muscle_group = models.CharField(max_length=10, choices=MuscleGroup.choices, default=MuscleGroup.OTHER)
    # Removing from the library only archives it: history and plans keep working.
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "name"], name="unique_exercise_name_per_user")]
        ordering = ["name"]

    def __str__(self):
        return self.name


class Plan(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="plans")
    name = models.CharField(max_length=60)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=False)
    # The day trained next; advances automatically when a workout is finished.
    current_day = models.ForeignKey("PlanDay", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name


class PlanDay(models.Model):
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="days")
    name = models.CharField(max_length=60)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.name


class PlanDayExercise(models.Model):
    """A template exercise of a training day with its default sets/reps/weight."""

    day = models.ForeignKey(PlanDay, on_delete=models.CASCADE, related_name="items")
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT, related_name="+")
    sets = models.PositiveSmallIntegerField(default=4)
    reps = models.PositiveSmallIntegerField(default=12)
    weight_kg = models.FloatField(default=0)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [models.UniqueConstraint(fields=["day", "exercise"], name="unique_exercise_per_day")]


class ActiveExercise(models.Model):
    """A card on today's training board."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="active_exercises")
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT, related_name="+")
    weight_kg = models.FloatField(default=0)
    sets = models.PositiveSmallIntegerField(default=4)
    reps = models.PositiveSmallIntegerField(default=12)
    completed = models.BooleanField(default=False)
    # True: part of the current day's template. False: added just for this workout.
    in_plan = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class WorkoutSession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions")
    performed_at = models.DateTimeField(db_index=True)
    # Snapshots, so history stays readable after a plan is renamed or deleted.
    plan_name = models.CharField(max_length=60, blank=True, null=True)
    day_name = models.CharField(max_length=60, blank=True, null=True)

    class Meta:
        ordering = ["-performed_at", "-id"]


class WorkoutEntry(models.Model):
    session = models.ForeignKey(WorkoutSession, on_delete=models.CASCADE, related_name="entries")
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT, related_name="+")
    weight_kg = models.FloatField(default=0)
    sets = models.PositiveSmallIntegerField(default=1)
    reps = models.PositiveSmallIntegerField(default=1)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]


class WeightUnit(models.TextChoices):
    KG = "KG", "kg"
    LBS = "LBS", "lbs"


class Profile(models.Model):
    """Per-user preferences and body metrics used by the strength scoring."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    unit = models.CharField(max_length=3, choices=WeightUnit.choices, default=WeightUnit.KG)
    add_to_plan_by_default = models.BooleanField(default=True)
    height_cm = models.FloatField(default=0)
    wingspan_cm = models.FloatField(default=0)
    body_weight_kg = models.FloatField(default=0)
    language = models.CharField(max_length=5, default="en")

    @property
    def ape_index(self) -> float:
        if self.height_cm > 0 and self.wingspan_cm > 0:
            return self.wingspan_cm / self.height_cm
        return 1.0
