"""
Plan share codes. Port of `PlanShare.kt` from ironlog-android; the format is defined in docs/formats.md.

- File: readable JSON (`to_json`).
- Code: "FP1:" + base64url(zlib(JSON)), used for both QR codes and text. Decoding finds the code
  anywhere in a block of text, so a whole chat message can be pasted.
"""
from __future__ import annotations

import base64
import json
import re
import zlib
from dataclasses import dataclass, field

PREFIX = "FP1:"
TYPE = "fitness-plan"  # kept for compatibility with codes already shared from the Android app
VERSION = 1
GROUPS = {"CHEST", "BACK", "LEGS", "SHOULDERS", "ARMS", "CORE", "OTHER"}
_CODE = re.compile(r"FP1:[A-Za-z0-9_-]+")

MAX_JSON_BYTES = 256 * 1024
MAX_DAYS = 30
MAX_EXERCISES_PER_DAY = 60
MAX_NAME = 60
DEFAULT_SETS = 4
DEFAULT_REPS = 12


class ShareError(ValueError):
    """A user-facing reason why a code or file could not be read."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class SharedExercise:
    name: str
    group: str
    sets: int
    reps: int
    weight_kg: float | None  # None: weights were not included when sharing


@dataclass
class SharedDay:
    name: str
    exercises: list[SharedExercise] = field(default_factory=list)


@dataclass
class SharedPlan:
    name: str
    days: list[SharedDay]

    @property
    def exercise_count(self) -> int:
        return sum(len(d.exercises) for d in self.days)

    @property
    def includes_weights(self) -> bool:
        return any(e.weight_kg is not None for d in self.days for e in d.exercises)


# ---------------- encode ----------------

def to_json(plan: SharedPlan) -> dict:
    def exercise(e: SharedExercise) -> dict:
        out = {"name": e.name, "group": e.group, "sets": e.sets, "reps": e.reps}
        if e.weight_kg is not None:
            out["weightKg"] = e.weight_kg
        return out

    return {
        "type": TYPE,
        "version": VERSION,
        "name": plan.name,
        "days": [{"name": d.name, "exercises": [exercise(e) for e in d.exercises]} for d in plan.days],
    }


def encode(plan: SharedPlan) -> str:
    raw = json.dumps(to_json(plan), ensure_ascii=False, separators=(",", ":")).encode()
    return PREFIX + base64.urlsafe_b64encode(zlib.compress(raw, 9)).decode().rstrip("=")


# ---------------- decode ----------------

def decode(text: str) -> SharedPlan:
    trimmed = text.strip().lstrip("﻿")
    if trimmed.startswith("{"):
        raw = trimmed
    else:
        match = _CODE.search(trimmed)
        if not match:
            raise ShareError("not_found", "No plan share code found.")
        raw = _inflate(match.group(0)[len(PREFIX):])
    try:
        root = json.loads(raw)
    except ValueError:
        raise ShareError("corrupt", "The share code is damaged.")
    if not isinstance(root, dict):
        raise ShareError("not_plan", "This is not a training plan.")
    return _parse(root)


def _inflate(b64: str) -> str:
    try:
        data = base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4))
    except (ValueError, TypeError):
        raise ShareError("incomplete", "The share code is incomplete. Make sure you copied all of it.")
    d = zlib.decompressobj()
    try:
        out = d.decompress(data, MAX_JSON_BYTES + 1)
    except zlib.error:
        raise ShareError("corrupt", "The share code is damaged.")
    if len(out) > MAX_JSON_BYTES or d.unconsumed_tail:
        raise ShareError("too_large", "The share code is too large.")
    if not d.eof:
        raise ShareError("incomplete", "The share code is incomplete. Make sure you copied all of it.")
    return out.decode("utf-8", errors="replace")


def _clean(raw, what: str) -> str:
    s = " ".join(str(raw or "").split())
    if not s:
        raise ShareError("empty_name", f"{what} is empty.")
    return s[:MAX_NAME]


def _int(value, default: int, low: int, high: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = default
    return min(max(n, low), high)


def _parse(root: dict) -> SharedPlan:
    if root.get("type") != TYPE:
        raise ShareError("not_plan", "This is not a training plan file.")
    if int(root.get("version") or 0) > VERSION:
        raise ShareError("too_new", "This plan comes from a newer version of IronLog.")
    days_json = root.get("days")
    if not isinstance(days_json, list) or not days_json:
        raise ShareError("no_days", "The plan has no training days.")
    if len(days_json) > MAX_DAYS:
        raise ShareError("too_many_days", f"Too many training days (max {MAX_DAYS}).")

    days = []
    for d in days_json:
        if not isinstance(d, dict):
            raise ShareError("corrupt", "The share code is damaged.")
        items = [e for e in (d.get("exercises") or []) if isinstance(e, dict)]
        if len(items) > MAX_EXERCISES_PER_DAY:
            raise ShareError("too_many_exercises", "A training day has too many exercises.")
        seen, exercises = set(), []
        for e in items:
            name = _clean(e.get("name"), "Exercise name")
            if name in seen:  # the same exercise twice in one day keeps only the first
                continue
            seen.add(name)
            weight = e.get("weightKg")
            exercises.append(SharedExercise(
                name=name,
                group=e.get("group") if e.get("group") in GROUPS else "OTHER",
                sets=_int(e.get("sets"), DEFAULT_SETS, 1, 99),
                reps=_int(e.get("reps"), DEFAULT_REPS, 1, 999),
                weight_kg=None if weight is None else min(max(float(weight), 0.0), 1000.0),
            ))
        days.append(SharedDay(_clean(d.get("name"), "Day name"), exercises))
    return SharedPlan(_clean(root.get("name"), "Plan name"), days)


def share_text(plan: SharedPlan) -> str:
    return (
        f"[IronLog plan] {plan.name} ({len(plan.days)} days, {plan.exercise_count} exercises)\n"
        "Copy this whole message, then in IronLog: Plans → Import → Paste share code\n"
        + encode(plan)
    )


def file_name(plan: SharedPlan) -> str:
    safe = re.sub(r'[\\/:*?"<>|\s]+', "_", plan.name)[:40]
    return f"plan_{safe}.json"
