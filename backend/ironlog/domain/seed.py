"""Starter exercise library and a push/pull/legs plan for new accounts. Chinese matches the Android app's SeedData."""

# (name, group)
EXERCISES = {
    "en": [
        ("Barbell Bench Press", "CHEST"), ("Incline Dumbbell Press", "CHEST"), ("Machine Chest Press", "CHEST"),
        ("Cable Crossover Fly", "CHEST"), ("Parallel Bar Dip", "CHEST"),
        ("Pull-up", "BACK"), ("Lat Pulldown", "BACK"), ("Barbell Row", "BACK"),
        ("Seated Cable Row", "BACK"), ("Single-Arm Dumbbell Row", "BACK"),
        ("Barbell Back Squat", "LEGS"), ("Deadlift", "LEGS"), ("Romanian Deadlift", "LEGS"),
        ("Leg Press", "LEGS"), ("Bulgarian Split Squat", "LEGS"), ("Barbell Hip Thrust", "LEGS"),
        ("Dumbbell Shoulder Press", "SHOULDERS"), ("Barbell Overhead Press", "SHOULDERS"),
        ("Dumbbell Lateral Raise", "SHOULDERS"), ("Cable Face Pull", "SHOULDERS"),
        ("Barbell Curl", "ARMS"), ("Dumbbell Hammer Curl", "ARMS"), ("Cable Triceps Pushdown", "ARMS"),
        ("Skull Crusher", "ARMS"),
        ("Plank", "CORE"), ("Hanging Leg Raise", "CORE"), ("Crunch", "CORE"),
    ],
    "zh": [
        ("杠铃平板卧推", "CHEST"), ("上斜哑铃卧推", "CHEST"), ("器械推胸", "CHEST"), ("绳索夹胸", "CHEST"), ("双杠臂屈伸", "CHEST"),
        ("引体向上", "BACK"), ("高位下拉", "BACK"), ("杠铃划船", "BACK"), ("坐姿划船", "BACK"), ("单臂哑铃划船", "BACK"),
        ("杠铃深蹲", "LEGS"), ("传统硬拉", "LEGS"), ("罗马尼亚硬拉", "LEGS"), ("腿举", "LEGS"), ("保加利亚分腿蹲", "LEGS"),
        ("杠铃臀推", "LEGS"),
        ("哑铃推举", "SHOULDERS"), ("杠铃推举", "SHOULDERS"), ("哑铃侧平举", "SHOULDERS"), ("绳索面拉", "SHOULDERS"),
        ("杠铃弯举", "ARMS"), ("哑铃锤式弯举", "ARMS"), ("绳索下压", "ARMS"), ("仰卧臂屈伸", "ARMS"),
        ("平板支撑", "CORE"), ("悬垂举腿", "CORE"), ("卷腹", "CORE"),
    ],
}

# plan name, [(day name, [(exercise, sets, reps, weight_kg)])]
PLAN = {
    "en": ("Push Pull Legs", [
        ("Push", [("Barbell Bench Press", 4, 8, 40), ("Incline Dumbbell Press", 3, 10, 16),
                  ("Dumbbell Shoulder Press", 4, 10, 14), ("Dumbbell Lateral Raise", 3, 15, 6),
                  ("Cable Triceps Pushdown", 3, 12, 20)]),
        ("Pull", [("Pull-up", 4, 8, 0), ("Barbell Row", 4, 8, 40), ("Lat Pulldown", 3, 10, 35),
                  ("Cable Face Pull", 3, 15, 15), ("Barbell Curl", 3, 10, 20)]),
        ("Legs", [("Barbell Back Squat", 5, 5, 60), ("Romanian Deadlift", 3, 8, 50), ("Leg Press", 3, 12, 80),
                  ("Barbell Hip Thrust", 3, 10, 60), ("Hanging Leg Raise", 3, 12, 0)]),
    ]),
    "zh": ("经典推拉腿 (PPL)", [
        ("推力日", [("杠铃平板卧推", 4, 8, 40), ("上斜哑铃卧推", 3, 10, 16), ("哑铃推举", 4, 10, 14),
                  ("哑铃侧平举", 3, 15, 6), ("绳索下压", 3, 12, 20)]),
        ("拉力日", [("引体向上", 4, 8, 0), ("杠铃划船", 4, 8, 40), ("高位下拉", 3, 10, 35),
                  ("绳索面拉", 3, 15, 15), ("杠铃弯举", 3, 10, 20)]),
        ("腿部日", [("杠铃深蹲", 5, 5, 60), ("罗马尼亚硬拉", 3, 8, 50), ("腿举", 3, 12, 80),
                  ("杠铃臀推", 3, 10, 60), ("悬垂举腿", 3, 12, 0)]),
    ]),
}
