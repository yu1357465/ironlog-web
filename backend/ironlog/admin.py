from django.contrib import admin

from .models import Exercise, Plan, PlanDay, Profile, WorkoutSession


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "muscle_group", "user", "archived")
    list_filter = ("muscle_group", "archived")
    search_fields = ("name", "user__username")


class PlanDayInline(admin.TabularInline):
    model = PlanDay
    extra = 0


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "is_active")
    inlines = [PlanDayInline]


@admin.register(WorkoutSession)
class WorkoutSessionAdmin(admin.ModelAdmin):
    list_display = ("performed_at", "user", "plan_name", "day_name")
    list_filter = ("user",)


admin.site.register(Profile)
