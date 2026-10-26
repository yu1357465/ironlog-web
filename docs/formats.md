# IronLog data formats

Shared by **ironlog-web** and **ironlog-android**. Both sides have tests that decode a code produced by the other
(`backend/ironlog/tests/test_domain.py::ANDROID_CODE`, Android `PlanShareTest.decodesCodeFromWebVersion`), so a
change here must be made in both repositories.

## Plan share code

Used for QR codes, copy/paste and plan files.

```
FP1:<base64url, no padding>( zlib( UTF-8 JSON ) )
```

- `FP1:` identifies the format and version 1. Decoders search for `FP1:[A-Za-z0-9_-]+` anywhere in the text, so a whole
  chat message can be pasted.
- zlib = DEFLATE with the zlib header (Java `Deflater`, Python `zlib.compress`, browser `CompressionStream('deflate')`).
- QR codes use error-correction level M. Codes over the QR capacity fall back to copy/paste or a file.

A plan **file** is the same JSON, uncompressed and pretty-printed:

```json
{
  "type": "fitness-plan",
  "version": 1,
  "name": "Push Pull Legs",
  "days": [
    {
      "name": "Push",
      "exercises": [
        { "name": "Barbell Bench Press", "group": "CHEST", "sets": 4, "reps": 8, "weightKg": 60 },
        { "name": "Dumbbell Shoulder Press", "group": "SHOULDERS", "sets": 3, "reps": 10 }
      ]
    }
  ]
}
```

| field | rules |
| --- | --- |
| `type` | always `fitness-plan` (kept from the first Android release) |
| `version` | `1`; decoders reject versions they do not know |
| `name`, day `name`, exercise `name` | trimmed, whitespace collapsed, max 60 characters, not empty |
| `group` | `CHEST` `BACK` `LEGS` `SHOULDERS` `ARMS` `CORE` `OTHER`; anything else becomes `OTHER` |
| `sets` / `reps` | clamped to 1–99 / 1–999 |
| `weightKg` | optional, kilograms, clamped to 0–1000. Omitted when the sharer chose not to include weights |

Limits: 30 days, 60 exercises per day, 256 KB of JSON after decompression. A repeated exercise within a day keeps the
first occurrence. Importing always creates a **new** plan; a name clash gets a numeric suffix.

## Training history CSV

```
date,plan,day,exercise,muscle_group,weight_kg,sets,reps
2026-10-20 18:30,Push Pull Legs,Push,Barbell Bench Press,Chest,62.5,4,8
```

- The web exports the English header above; the Android app exports `日期,计划,训练日,动作,肌群,重量(kg),组数,次数`.
  Both import either, plus the old V2 Android report (`日期,计划名称,训练日主题,动作名称,动作类型,…`).
- Columns are matched by header prefix, in any order. Required: date, exercise, weight, reps (sets defaults to 1).
- Dates: `yyyy-MM-dd[ HH:mm[:ss]]`, `yyyy/MM/dd[ HH:mm]`, `yyyy.MM.dd`, `yyyy年MM月dd日[ HH:mm]`. Date-only rows are
  placed at 12:00 local time. The web interprets dates in the browser's time zone.
- Weight is kilograms unless the header contains `lb`/`磅`. Cells may carry units (`60kg`, `4组`).
- Muscle group: an enum name, an English or Chinese label, or a keyword (`胸`, `leg`, `abs`…). Empty → guessed from the
  exercise name.
- Rows with the same exact time, plan and day form one workout. A row identical to an existing record (same day,
  exercise, weight, sets and reps) is skipped, so re-importing a file does not duplicate it.
- Exports start with a UTF-8 BOM so Excel opens them correctly; imports also accept GBK.
