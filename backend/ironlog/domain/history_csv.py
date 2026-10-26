"""
Training history CSV. Port of `HistoryImport.kt` / `Csv` from ironlog-android; format in docs/formats.md.

Columns are matched by header (any order, Chinese or English aliases), so the web export,
the Android export and the old V2 Android report can all be imported.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo

LBS_PER_KG = 2.20462
EXPORT_HEADER = ["date", "plan", "day", "exercise", "muscle_group", "weight_kg", "sets", "reps"]

_ALIASES = {
    "date": ("日期", "date", "时间", "训练日期"),
    "plan": ("计划", "计划名称", "plan"),
    "day": ("训练日", "训练日主题", "训练日名称", "day", "workout"),
    "exercise": ("动作", "动作名称", "exercise", "name"),
    "group": ("肌群", "动作类型", "部位", "目标肌群", "muscle", "category"),
    "weight": ("重量", "weight"),
    "sets": ("组数", "sets"),
    "reps": ("次数", "reps"),
}
_REQUIRED = ("date", "exercise", "weight", "reps")

_DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d",
    "%Y/%m/%d %H:%M", "%Y/%m/%d", "%Y.%m.%d", "%Y年%m月%d日 %H:%M", "%Y年%m月%d日",
]

GROUP_LABELS = {
    "CHEST": "Chest", "BACK": "Back", "LEGS": "Legs & glutes", "SHOULDERS": "Shoulders",
    "ARMS": "Arms", "CORE": "Core", "OTHER": "Other",
}
_ZH_LABELS = {"胸部": "CHEST", "背部": "BACK", "腿臀": "LEGS", "肩部": "SHOULDERS", "手臂": "ARMS", "核心": "CORE", "其他": "OTHER"}


@dataclass
class ImportRow:
    line: int
    performed_at: datetime
    plan_name: str | None
    day_name: str | None
    exercise: str
    group: str | None
    weight_kg: float
    sets: int
    reps: int


@dataclass
class ImportIssue:
    line: int
    message: str


@dataclass
class ParsedImport:
    rows: list[ImportRow]
    issues: list[ImportIssue]


# ---------------- export ----------------

def export(entries, tz: ZoneInfo) -> str:
    """entries: iterable of (performed_at, plan_name, day_name, exercise, group, weight_kg, sets, reps)."""
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(EXPORT_HEADER)
    for performed_at, plan, day, exercise, group, weight, sets, reps in entries:
        w.writerow([
            performed_at.astimezone(tz).strftime("%Y-%m-%d %H:%M"), plan or "", day or "",
            exercise, GROUP_LABELS.get(group, "Other"), _fmt(weight), sets, reps,
        ])
    return out.getvalue()


def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def template() -> str:
    return (
        ",".join(EXPORT_HEADER) + "\n"
        "2026-10-20,Push Pull Legs,Push,Barbell Bench Press,Chest,60,4,8\n"
        "2026-10-20,Push Pull Legs,Push,Dumbbell Shoulder Press,Shoulders,16,3,10\n"
        "2026-10-22,Push Pull Legs,Pull,Pull-up,Back,0,4,8\n"
        "2026-10-22,Push Pull Legs,Pull,Barbell Row,Back,50,4,10\n"
    )


AI_PROMPT = f"""Convert my workout records below into CSV so I can import them into my IronLog app. Rules:

1. The first line is the header and must be exactly: {",".join(EXPORT_HEADER)}
2. One row per exercise per workout. A workout with 5 exercises becomes 5 rows.
3. date: yyyy-MM-dd (e.g. 2026-10-20). If the year is missing, assume the most recent one.
4. plan and day may be empty. day is what was trained, e.g. "Push", "Legs", "Upper body".
5. exercise: use common exercise names, e.g. "Barbell Bench Press", "Dumbbell Shoulder Press", "Lat Pulldown"; keep each exercise's name identical across the whole file.
6. muscle_group must be one of: Chest, Back, Legs & glutes, Shoulders, Arms, Core, Other.
7. weight_kg: a plain number in kg (convert pounds, one decimal place). Bodyweight exercises: 0. Dumbbells: the weight of one dumbbell.
8. sets and reps: positive whole numbers. If sets of the same exercise used different weights or reps, either split them into rows with sets = 1, or merge into one row using the most common reps.
9. Wrap any field containing a comma in double quotes.
10. Output only the CSV itself — no explanation and no code block.

Example:
{template().rstrip()}

My original records:
"""


# ---------------- import ----------------

def decode_bytes(data: bytes) -> str:
    """UTF-8 first; Excel often saves Chinese CSV as GBK, so fall back to it."""
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("gbk", errors="replace")


def parse_date(text: str, tz: ZoneInfo) -> datetime | None:
    t = text.strip()
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(t, fmt)
        except ValueError:
            continue
        if not 1990 <= dt.year <= 2100:
            return None
        if "%H" not in fmt:  # date only: record as midday of that day
            dt = datetime.combine(dt.date(), time(12, 0))
        return dt.replace(tzinfo=tz)
    return None


def _number(text: str) -> float | None:
    t = re.sub(r"(kg|lbs|lb|次|组)$", "", text.strip().lower()).strip()
    try:
        return float(t)
    except ValueError:
        return None


def group_from_label(label: str) -> str | None:
    raw = label.strip()
    l = raw.lower()
    if not l:
        return None
    if raw in _ZH_LABELS:
        return _ZH_LABELS[raw]
    if raw.upper() in GROUP_LABELS:
        return raw.upper()
    rules = [
        (("胸", "chest", "pec"), "CHEST"),
        (("背", "back", "lat"), "BACK"),
        (("腿", "臀", "leg", "glute", "quad", "hamstring"), "LEGS"),
        (("肩", "shoulder", "delt"), "SHOULDERS"),
        (("臂", "二头", "三头", "arm", "bicep", "tricep"), "ARMS"),
        (("核心", "腹", "core", "abs"), "CORE"),
    ]
    for words, group in rules:
        if any(w in l for w in words):
            return group
    return "OTHER"


def guess_group(exercise: str) -> str:
    """Guess a muscle group from the exercise name when none was given."""
    n = exercise.lower()

    def has(*w):
        return any(x in n for x in w)

    # Order matters: "hanging leg raise" contains "leg" but is core; "leg curl" contains "curl" but is legs.
    if has("卧推", "推胸", "夹胸", "飞鸟", "双杠", "俯卧撑", "bench", "chest", "fly", "flye", "push-up", "push up", "pushup", "dip"):
        return "CHEST" if not has("reverse fly", "rear delt", "反向飞鸟") else "SHOULDERS"
    if has("卷腹", "举腿", "平板支撑", "健腹轮", "腹", "crunch", "leg raise", "plank", "ab wheel", "sit-up"):
        return "CORE"
    if has("蹲", "硬拉", "腿", "臀", "提踵", "弓步", "squat", "deadlift", "leg", "glute", "hip thrust", "calf", "lunge"):
        return "LEGS"
    if has("引体", "下拉", "划船", "耸肩", "pull-up", "pull up", "pulldown", "row", "shrug", "chin"):
        return "BACK"
    if has("推举", "肩推", "平举", "面拉", "肩", "shoulder", "overhead", "raise", "face pull", "delt"):
        return "SHOULDERS"
    if has("弯举", "下压", "臂屈伸", "二头", "三头", "curl", "pushdown", "triceps", "tricep", "biceps", "kickback"):
        return "ARMS"
    return "OTHER"


def parse(text: str, tz: ZoneInfo) -> ParsedImport:
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    table = [(i + 1, r) for i, r in enumerate(rows) if any(c.strip() for c in r)]
    if not table:
        return ParsedImport([], [ImportIssue(0, "The file is empty.")])

    header_line, header = table[0]
    columns: dict[str, int] = {}
    for idx, raw in enumerate(header):
        name = raw.strip().lower()
        for col, aliases in _ALIASES.items():
            if col not in columns and any(name.startswith(a.lower()) for a in aliases):
                columns[col] = idx
                break
    missing = [c for c in _REQUIRED if c not in columns]
    if missing:
        return ParsedImport([], [ImportIssue(
            header_line, f"The header is missing: {', '.join(missing)}. Expected: {','.join(EXPORT_HEADER)}")])

    weight_header = header[columns["weight"]].lower()
    in_lbs = "lb" in weight_header or "磅" in weight_header

    out, issues = [], []
    for line, cells in table[1:]:
        def cell(col):
            i = columns.get(col)
            return cells[i].strip() if i is not None and i < len(cells) else ""

        problems = []
        performed = parse_date(cell("date"), tz)
        if performed is None:
            problems.append(f'unrecognised date "{cell("date")}"')
        exercise = cell("exercise")
        if not exercise:
            problems.append("exercise is empty")
        weight = _number(cell("weight"))
        if weight is None or weight < 0:
            problems.append(f'weight "{cell("weight")}" is not a valid number')
        reps = _number(cell("reps"))
        if reps is None or reps <= 0:
            problems.append(f'reps "{cell("reps")}" is not a positive whole number')
        sets_text = cell("sets")
        sets = 1 if not sets_text else _number(sets_text)
        if sets is None or sets <= 0:
            problems.append(f'sets "{sets_text}" is not a positive whole number')

        if problems:
            issues.append(ImportIssue(line, "; ".join(problems)))
            continue
        out.append(ImportRow(
            line=line, performed_at=performed,
            plan_name=cell("plan") or None, day_name=cell("day") or None,
            exercise=exercise[:60], group=group_from_label(cell("group")),
            weight_kg=weight / LBS_PER_KG if in_lbs else weight, sets=int(sets), reps=int(reps),
        ))
    return ParsedImport(out, issues)


def dedupe_key(performed_at: datetime, exercise: str, weight_kg: float, sets: int, reps: int) -> str:
    """Same day, exercise, weight, sets and reps counts as the same record."""
    return f"{performed_at.date().isoformat()}|{exercise.strip()}|{round(weight_kg * 10)}|{sets}|{reps}"


@dataclass
class ImportPlan:
    sessions: list[list[ImportRow]]
    duplicates: int
    new_exercises: list[str]
    issues: list[ImportIssue]

    @property
    def entry_count(self) -> int:
        return sum(len(s) for s in self.sessions)


def plan(parsed: ParsedImport, existing: list[str], known_exercises: set[str], tz: ZoneInfo) -> ImportPlan:
    remaining: dict[str, int] = {}
    for k in existing:
        remaining[k] = remaining.get(k, 0) + 1
    duplicates, fresh = 0, []
    for r in parsed.rows:
        k = dedupe_key(r.performed_at.astimezone(tz), r.exercise, r.weight_kg, r.sets, r.reps)
        if remaining.get(k, 0) > 0:
            remaining[k] -= 1
            duplicates += 1
        else:
            fresh.append(r)

    # Same exact time + plan + day = one workout (exports share a time per workout; date-only rows sit at midday).
    groups: dict[tuple, list[ImportRow]] = {}
    for r in fresh:
        groups.setdefault((r.performed_at, r.plan_name or "", r.day_name or ""), []).append(r)
    sessions = [sorted(groups[k], key=lambda r: r.line) for k in sorted(groups)]
    new_exercises = list(dict.fromkeys(r.exercise.strip() for r in fresh if r.exercise.strip() not in known_exercises))
    return ImportPlan(sessions, duplicates, new_exercises, parsed.issues)
