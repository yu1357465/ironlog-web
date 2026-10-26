"""
Per-exercise strength standards, recognised from the exercise name.

Port of `LiftStandards.kt` from ironlog-android. Keywords cover both Chinese and English
names because the library is user-defined. Rule order matters: more specific keywords first.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Leverage(Enum):
    """How arm length affects the lift: long arms are a disadvantage when pushing, an advantage when pulling."""

    PUSH = "push"
    PULL = "pull"
    NONE = "none"


class Equipment(Enum):
    BARBELL = "barbell"
    DUMBBELL = "dumbbell"
    MACHINE = "machine"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class LiftStandard:
    """
    ratio: an estimated 1RM of body weight × ratio scores 100 (roughly an "advanced" gym-goer).
           Dumbbell lifts are per hand.
    bodyweight_fraction: share of body weight moved in bodyweight lifts (pull-up ≈ 1.0), added to the logged load.
    rep_target: for unweighted bodyweight moves (e.g. hanging leg raise), scored by reps instead.
    """

    ratio: float
    leverage: Leverage = Leverage.NONE
    bodyweight_fraction: float = 0.0
    rep_target: int | None = None


def _has(name: str, *words: str) -> bool:
    return any(w in name for w in words)


def equipment_of(name: str) -> Equipment:
    n = name.lower()
    if _has(n, "哑铃", "dumbbell", "db "):
        return Equipment.DUMBBELL
    if _has(n, "绳索", "器械", "坐姿", "史密斯", "拉力器", "龙门架", "cable", "machine", "smith", "seated", "pec deck"):
        return Equipment.MACHINE
    if _has(n, "杠铃", "barbell"):
        return Equipment.BARBELL
    return Equipment.UNKNOWN


def _std(ratio: float, leverage: Leverage = Leverage.NONE) -> LiftStandard:
    return LiftStandard(ratio, leverage)


def _by_equipment(dumbbell: float, machine: float, other: float, leverage: Leverage = Leverage.NONE):
    def pick(e: Equipment) -> LiftStandard:
        if e is Equipment.DUMBBELL:
            return _std(dumbbell, leverage)
        if e is Equipment.MACHINE:
            return _std(machine, leverage)
        return _std(other, leverage)
    return pick


# (keywords, standard-for-equipment)
_RULES: list[tuple[tuple[str, ...], callable]] = [
    # ---- legs & glutes ----
    (("罗马尼亚硬拉", "直腿硬拉", "romanian deadlift", "rdl", "stiff-leg"),
     lambda e: _std(0.8 if e is Equipment.DUMBBELL else 1.75, Leverage.PULL)),
    (("硬拉", "deadlift"), lambda e: _std(1.0 if e is Equipment.DUMBBELL else 2.25, Leverage.PULL)),
    (("分腿蹲", "箭步蹲", "弓步", "split squat", "lunge"), lambda e: _std(0.5 if e is Equipment.DUMBBELL else 1.2)),
    (("高脚杯深蹲", "goblet squat"), lambda e: _std(0.9)),
    (("深蹲", "squat"), lambda e: _std(2.0 if e is Equipment.MACHINE else 1.75)),
    (("腿举", "倒蹬", "leg press"), lambda e: _std(3.0)),
    (("臀推", "臀桥", "hip thrust", "glute bridge"), lambda e: _std(2.25)),
    (("腿弯举", "leg curl", "hamstring curl"), lambda e: _std(1.4)),
    (("腿屈伸", "leg extension"), lambda e: _std(1.3)),
    (("腿外展", "腿内收", "abduction", "adduction"), lambda e: _std(1.0)),
    (("提踵", "calf raise"), lambda e: _std(1.5)),
    # ---- rear delts (must match before chest "fly") ----
    (("反向飞鸟", "后束飞鸟", "俯身飞鸟", "reverse fly", "rear delt"),
     lambda e: _std(0.8 if e is Equipment.MACHINE else 0.25)),
    # ---- chest ----
    (("仰卧臂屈伸", "颅骨粉碎", "skull crusher", "lying triceps extension"),
     lambda e: _std(0.3 if e is Equipment.DUMBBELL else 0.6)),
    (("双杠臂屈伸", "双杠", "parallel bar dip", "chest dip"),
     lambda e: LiftStandard(1.6, Leverage.PUSH, bodyweight_fraction=1.0)),
    # Push-ups share the bench standard; hands raised ≈ 45% of body weight, feet raised ≈ 75%.
    (("上斜俯卧撑", "incline push-up", "incline push up"),
     lambda e: LiftStandard(1.5, Leverage.PUSH, bodyweight_fraction=0.45)),
    (("下斜俯卧撑", "decline push-up", "decline push up"),
     lambda e: LiftStandard(1.5, Leverage.PUSH, bodyweight_fraction=0.75)),
    (("俯卧撑", "push-up", "push up", "pushup"), lambda e: LiftStandard(1.5, Leverage.PUSH, bodyweight_fraction=0.65)),
    (("夹胸", "飞鸟", "蝴蝶机", "fly", "flye", "pec deck", "crossover"),
     lambda e: _std(0.35 if e is Equipment.DUMBBELL else 1.1)),
    (("上斜卧推", "上斜哑铃卧推", "上斜杠铃卧推", "上斜推", "incline bench", "incline press", "incline dumbbell press"),
     lambda e: _std(0.45 if e is Equipment.DUMBBELL else 1.25, Leverage.PUSH)),
    (("卧推", "bench press"), _by_equipment(0.55, 1.4, 1.5, Leverage.PUSH)),
    (("推胸", "chest press"), lambda e: _std(1.4, Leverage.PUSH)),
    # ---- back ----
    # Assisted pull-up: the logged weight is assistance, not load, so body weight is not counted.
    (("辅助引体", "弹力带引体", "assisted pull", "assisted chin"), lambda e: _std(1.15, Leverage.PULL)),
    (("引体", "pull-up", "pull up", "pullup", "chin-up", "chin up"),
     lambda e: LiftStandard(1.5, Leverage.PULL, bodyweight_fraction=1.0)),
    (("直臂下拉", "直臂下压", "straight-arm", "straight arm"), lambda e: _std(0.6, Leverage.PULL)),
    (("下拉", "pulldown", "pull-down", "lat pull"), lambda e: _std(1.15, Leverage.PULL)),
    (("划船", "row"), lambda e: _std(0.65 if e is Equipment.DUMBBELL else 1.2, Leverage.PULL)),
    (("耸肩", "shrug"), lambda e: _std(0.7 if e is Equipment.DUMBBELL else 1.5)),
    # ---- shoulders ----
    (("侧平举", "前平举", "lateral raise", "front raise", "side raise"),
     lambda e: _std(0.35 if e is Equipment.MACHINE else 0.22)),
    (("面拉", "face pull"), lambda e: _std(0.6, Leverage.PULL)),
    (("推举", "肩推", "overhead press", "shoulder press", "military press", "ohp"),
     _by_equipment(0.42, 0.9, 1.0, Leverage.PUSH)),
    # ---- arms ----
    (("下压", "pushdown", "push-down"), lambda e: _std(0.7)),
    (("弯举", "curl"), lambda e: _std(0.38 if e is Equipment.DUMBBELL else 0.7)),
    (("臂屈伸", "triceps extension", "tricep extension", "kickback", "dip"), lambda e: _std(0.5)),
    # ---- core (bodyweight moves scored by reps) ----
    (("平板支撑", "plank"), lambda e: LiftStandard(0.5, rep_target=120)),
    (("举腿", "leg raise", "knee raise"), lambda e: LiftStandard(0.5, rep_target=15)),
    (("卷腹", "crunch", "sit-up", "sit up"), lambda e: LiftStandard(0.6, rep_target=30)),
    (("健腹轮", "ab wheel", "rollout"), lambda e: LiftStandard(0.5, rep_target=15)),
]

_FALLBACK = {
    "CHEST": (1.4, Leverage.PUSH),
    "BACK": (1.2, Leverage.PULL),
    "LEGS": (1.75, Leverage.NONE),
    "SHOULDERS": (0.9, Leverage.PUSH),
    "ARMS": (0.7, Leverage.NONE),
    "CORE": (0.5, Leverage.NONE),
    "OTHER": (1.0, Leverage.NONE),
}


def _fallback(group: str, equipment: Equipment) -> LiftStandard:
    barbell, leverage = _FALLBACK.get(group, _FALLBACK["OTHER"])
    ratio = barbell * 0.4 if equipment is Equipment.DUMBBELL else barbell
    return LiftStandard(ratio, leverage, rep_target=20 if group == "CORE" else None)


def for_exercise(name: str, group: str) -> LiftStandard:
    n = name.lower()
    equipment = equipment_of(n)
    for keywords, standard in _RULES:
        if _has(n, *keywords):
            return standard(equipment)
    return _fallback(group, equipment)
