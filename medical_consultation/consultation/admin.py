from django.contrib import admin
from .models import Clinic, Patient, Consultation, Appointment


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ("clinic_id", "name")
    search_fields = ("clinic_id", "name")
    ordering = ("name",)


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("patient_id", "full_name", "clinic")
    search_fields = ("patient_id", "full_name")
    list_filter = ("clinic",)
    ordering = ("full_name",)


@admin.register(Consultation)
class ConsultationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "patient",
        "clinic",
        "doctor",
        "status",
        "created_at",
    )
    list_filter = ("status", "clinic", "doctor")
    search_fields = (
        "patient__patient_id",
        "patient__full_name",
        "doctor__username",
    )
    readonly_fields = ("created_at", "updated_at")
    ordering = ("-created_at",)


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = (
        "room_id",
        "doctor",
        "patient",
        "clinic",
        "status",
        "start_time",
    )
    list_filter = ("status", "clinic", "doctor")
    search_fields = (
        "room_id",
        "patient__patient_id",
        "doctor__username",
    )
    readonly_fields = ("room_id", "start_time")
    ordering = ("-start_time",)