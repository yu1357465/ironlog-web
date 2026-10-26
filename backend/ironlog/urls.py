from django.urls import path

from . import views as v

urlpatterns = [
    # auth & profile
    path("auth/me", v.me),
    path("auth/register", v.register),
    path("auth/login", v.login_view),
    path("auth/logout", v.logout_view),
    path("profile", v.profile),
    # exercise library
    path("exercises", v.exercises),
    path("exercises/<int:pk>", v.exercise_detail),
    path("exercises/<int:pk>/trend", v.exercise_trend),
    # plans
    path("plans", v.plans),
    path("plans/reorder", v.plans_reorder),
    path("plans/import/preview", v.plan_import_preview),
    path("plans/import", v.plan_import),
    path("plans/<int:pk>", v.plan_detail),
    path("plans/<int:pk>/activate", v.plan_activate),
    path("plans/<int:pk>/share", v.plan_share),
    path("plans/<int:pk>/days", v.plan_days),
    path("plans/<int:pk>/days/reorder", v.plan_days_reorder),
    path("days/<int:pk>", v.day_detail),
    path("days/<int:pk>/copy", v.day_copy),
    path("days/<int:pk>/items", v.day_items),
    path("days/<int:pk>/items/reorder", v.day_items_reorder),
    path("day-items/<int:pk>", v.day_item_detail),
    # today's workout
    path("workout", v.workout),
    path("workout/items", v.workout_items),
    path("workout/items/restore", v.workout_restore),
    path("workout/items/<int:pk>", v.workout_item),
    path("workout/items/<int:pk>/in-plan", v.workout_item_in_plan),
    path("workout/items/<int:pk>/replace", v.workout_item_replace),
    path("workout/reorder", v.workout_reorder),
    path("workout/select-day", v.workout_select_day),
    path("workout/reload", v.workout_reload),
    path("workout/finish", v.workout_finish),
    # history
    path("history", v.history),
    path("history/manual", v.history_manual),
    path("history/export.csv", v.history_export),
    path("history/template.csv", v.history_template),
    path("history/ai-prompt", v.history_ai_prompt),
    path("history/import/preview", v.history_import_preview),
    path("history/import", v.history_import),
    path("history/sessions/<int:pk>", v.history_session),
    path("history/entries/<int:pk>", v.history_entry),
    # analytics
    path("stats", v.stats),
]
