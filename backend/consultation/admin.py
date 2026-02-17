# consultation/admin.py
# Registers all models so they appear in Django Admin at /admin/

from django.contrib import admin
from .models import Clinic, Meeting, UserProfile, DoctorAvailability, Patient


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display  = ("user", "role", "mobile", "clinic", "department")
    list_filter   = ("role", "clinic")
    search_fields = ("user__username", "user__first_name", "user__last_name")


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display  = ("clinic_id", "name")
    search_fields = ("clinic_id", "name")
    ordering      = ("name",)


@admin.register(DoctorAvailability)
class DoctorAvailabilityAdmin(admin.ModelAdmin):
    list_display  = ("doctor", "clinic", "day_of_week", "start_time", "end_time")
    list_filter   = ("clinic", "day_of_week")
    search_fields = ("doctor__username", "doctor__first_name")


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display    = ("meeting_id", "patient", "doctor", "clinic", "scheduled_time", "status", "appointment_type")
    list_filter     = ("status", "meeting_type", "appointment_type", "clinic")
    search_fields   = ("patient__username", "doctor__username", "room_id")
    readonly_fields = ("room_id", "created_at", "updated_at")
    ordering        = ("-scheduled_time",)


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display  = ("patient_id", "full_name", "clinic")
    search_fields = ("patient_id", "full_name")
    list_filter   = ("clinic",)