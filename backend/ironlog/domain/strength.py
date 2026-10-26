"""Strength scoring. Port of `StrengthAnalyzer.kt` from ironlog-android; keep the two in step."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum

from . import standards
from .standards import Leverage

RADAR_GROUPS = ["CHEST", "BACK", "LEGS", "SHOULDERS", "ARMS", "CORE"]
DEFAULT_BODY_WEIGHT = 70.0
RECENT_DAYS = 90


class RadarMode(Enum):
    """Each mode only counts sets in its rep range."""

    OVERALL = range(1, 16)
    STRENGTH = range(1, 7)
    ENDURANCE = range(10, 31)


@dataclass(frozen=True)
class Lift:
    exercise_id: int
    name: str
    group: str
    weight_kg: float
    reps: int
    sets: int
    performed_at: datetime


@dataclass(frozen=True)
class BestLift:
    name: str
    group: str
    estimated_1rm_kg: float


@dataclass(frozen=True)
class Distribution:
    strength: int
    hypertrophy: int
    endurance: int


@dataclass(frozen=True)
class StrengthReport:
    scores: dict[str, float]
    distribution: Distribution
    best_lifts: list[BestLift]
    recent_only: bool


def brzycki(weight: float, reps: int) -> float:
    return 0.0 if reps <= 0 or reps >= 37 else weight * 36.0 / (37.0 - reps)


def epley(weight: float, reps: int) -> float:
    if reps <= 0:
        return 0.0
    return weight if reps == 1 else weight * (1.0 + reps / 30.0)


def estimate_1rm(weight: float, reps: int) -> float:
    """Brzycki up to 10 reps; above that it overestimates badly, so switch to Epley. They meet at 10."""
    return brzycki(weight, reps) if reps <= 10 else epley(weight, reps)


def _leverage_factor(leverage: Leverage, ape_index: float) -> float:
    """Long arms: push lifts scaled up, pull lifts scaled down. Capped at ±8% to absorb input errors."""
    ape = min(max(ape_index, 0.92), 1.08)
    if leverage is Leverage.PUSH:
        return ape
    if leverage is Leverage.PULL:
        return 1.0 / ape
    return 1.0


def score_set(lift: Lift, body_weight: float, ape_index: float) -> float:
    std = standards.for_exercise(lift.name, lift.group)
    if lift.weight_kg <= 0 and std.bodyweight_fraction == 0.0:
        return 0.0 if std.rep_target is None else lift.reps / std.rep_target * 100
    load = lift.weight_kg + body_weight * std.bodyweight_fraction
    rm = estimate_1rm(load, lift.reps) * _leverage_factor(std.leverage, ape_index)
    return rm / (body_weight * std.ratio) * 100


def distribution(lifts: list[Lift]) -> Distribution:
    """Training structure by set count: 1–5 / 6–12 / 13+ reps."""
    s = h = e = 0
    for lift in lifts:
        sets = max(lift.sets, 1)
        if lift.reps <= 0:
            continue
        if lift.reps <= 5:
            s += sets
        elif lift.reps <= 12:
            h += sets
        else:
            e += sets
    return Distribution(s, h, e)


def analyze(lifts: list[Lift], mode: RadarMode, body_weight: float, ape_index: float, now: datetime) -> StrengthReport:
    bw = body_weight if body_weight > 0 else DEFAULT_BODY_WEIGHT
    recent = [l for l in lifts if l.performed_at >= now - timedelta(days=RECENT_DAYS)]
    source = recent or lifts
    in_mode = [l for l in source if l.reps in mode.value]

    best_per_exercise: dict[int, float] = {}
    group_of: dict[int, str] = {}
    for lift in in_mode:
        score = score_set(lift, bw, ape_index)
        best_per_exercise[lift.exercise_id] = max(best_per_exercise.get(lift.exercise_id, 0.0), score)
        group_of[lift.exercise_id] = lift.group

    scores = {}
    for g in RADAR_GROUPS:
        best = max((v for k, v in best_per_exercise.items() if group_of[k] == g), default=0.0)
        scores[g] = min(max(best, 0.0), 100.0)

    best_rm: dict[int, BestLift] = {}
    for lift in source:
        if not (1 <= lift.reps <= 15) or lift.weight_kg <= 0:
            continue
        rm = estimate_1rm(lift.weight_kg, lift.reps)
        if lift.exercise_id not in best_rm or rm > best_rm[lift.exercise_id].estimated_1rm_kg:
            best_rm[lift.exercise_id] = BestLift(lift.name, lift.group, rm)
    best_lifts = sorted(best_rm.values(), key=lambda b: b.estimated_1rm_kg, reverse=True)[:8]

    return StrengthReport(scores, distribution(source), best_lifts, recent_only=bool(recent))
