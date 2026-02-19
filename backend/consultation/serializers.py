# consultation/serializers.py
#
# FIXED — Bug 1:
#   MeetingSerializer was missing `sales` and `sales_name` fields.
#   Frontend (SalesHome.js, PatientHome.js) accesses appt.sales_name
#   and appt.sales on every sales-meeting card / today row.
#   Without these fields every sales meeting showed "Sales Rep" or "—"
#   regardless of which rep was assigned.

from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Clinic, Meeting, UserProfile, DoctorAvailability


# =============================================================================
# USER & PROFILE
# =============================================================================

class UserProfileSerializer(serializers.ModelSerializer):
    """Serializes the UserProfile extra fields (role, DOB, sex, mobile, etc.)"""
    class Meta:
        model = UserProfile
        fields = ["role", "date_of_birth", "sex", "mobile", "department", "clinic", "photo"]


class UserSerializer(serializers.ModelSerializer):
    """
    Full user serializer including profile info.
    Used in /api/profile/ and user-listing endpoints.
    """
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "email", "profile"]


# =============================================================================
# CLINIC
# =============================================================================

class ClinicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clinic
        fields = "__all__"


# =============================================================================
# DOCTOR AVAILABILITY
# =============================================================================

class DoctorAvailabilitySerializer(serializers.ModelSerializer):
    """
    Used when fetching or setting a doctor's / sales rep's working hours.
    """
    day_label = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model = DoctorAvailability
        fields = ["id", "doctor", "clinic", "day_of_week", "day_label", "start_time", "end_time"]


# =============================================================================
# MEETING — the main appointment serializer
# =============================================================================

class MeetingSerializer(serializers.ModelSerializer):
    """
    Used for listing appointments on the calendar and showing the appointment card.
    Includes nested doctor, patient, and sales names for easy display in React.
    """

    # Read-only computed fields for display (not stored separately)
    doctor_name  = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()
    clinic_name  = serializers.SerializerMethodField()
    # FIX: was missing — SalesHome.js and PatientHome.js both access appt.sales_name
    sales_name   = serializers.SerializerMethodField()

    # Human-readable versions of choice fields
    meeting_type_label     = serializers.CharField(source="get_meeting_type_display",     read_only=True)
    appointment_type_label = serializers.CharField(source="get_appointment_type_display", read_only=True)
    status_label           = serializers.CharField(source="get_status_display",           read_only=True)

    class Meta:
        model = Meeting
        fields = [
            "meeting_id",
            "room_id",
            "meeting_type",
            "meeting_type_label",
            "appointment_type",
            "appointment_type_label",
            "scheduled_time",
            "duration",
            "participants",
            "patient",
            "patient_name",
            "doctor",
            "doctor_name",
            "clinic",
            "clinic_name",
            # FIX: added sales + sales_name ↓
            "sales",
            "sales_name",
            "appointment_reason",
            "department",
            "remark",
            "speech_to_text",
            "status",
            "status_label",
            "created_at",
        ]
        read_only_fields = ["meeting_id", "room_id", "created_at"]

    def get_doctor_name(self, obj):
        if obj.doctor:
            return obj.doctor.get_full_name() or obj.doctor.username
        return ""

    def get_patient_name(self, obj):
        if obj.patient:
            return obj.patient.get_full_name() or obj.patient.username
        return ""

    def get_clinic_name(self, obj):
        if obj.clinic:
            return obj.clinic.name
        return ""

    # FIX: new method — resolves sales rep's display name
    def get_sales_name(self, obj):
        if obj.sales:
            return obj.sales.get_full_name() or obj.sales.username
        return ""


class MeetingCreateSerializer(serializers.ModelSerializer):
    """
    Lighter serializer used only for CREATING a new appointment booking.
    The patient or admin sends this data to POST /api/book-appointment/
    """
    class Meta:
        model = Meeting
        fields = [
            "meeting_type",
            "appointment_type",
            "scheduled_time",
            "duration",
            "patient",
            "doctor",
            "clinic",
            "appointment_reason",
            "department",
            "remark",
        ]