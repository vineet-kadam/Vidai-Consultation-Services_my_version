# consultation/serializers.py
#
# Serializers convert Django model objects → JSON (for API responses)
# and validate incoming JSON → Python data (for API requests).
# Think of them as the "translator" between your database and React.

from django.contrib.auth.models import User
from rest_framework import serializers
from .models import Clinic, Meeting, UserProfile, DoctorAvailability, Patient


# =============================================================================
# USER & PROFILE
# =============================================================================

class UserProfileSerializer(serializers.ModelSerializer):
    """Serializes the UserProfile extra fields (role, DOB, sex, mobile, etc.)"""
    class Meta:
        model  = UserProfile
        fields = ["role", "date_of_birth", "sex", "mobile", "department", "clinic", "photo"]


class UserSerializer(serializers.ModelSerializer):
    """
    Full user serializer including profile info.
    Used in /api/profile/ and user-listing endpoints.
    """
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model  = User
        fields = ["id", "username", "first_name", "last_name", "email", "profile"]


# =============================================================================
# CLINIC
# =============================================================================

class ClinicSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Clinic
        fields = "__all__"


# =============================================================================
# DOCTOR AVAILABILITY
# =============================================================================

class DoctorAvailabilitySerializer(serializers.ModelSerializer):
    """
    Used when fetching or setting a doctor's working hours.
    Example response:
    {
      "id": 1,
      "doctor": 5,
      "clinic": 2,
      "day_of_week": 0,       ← Monday
      "start_time": "09:00",
      "end_time": "17:00"
    }
    """
    day_label = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model  = DoctorAvailability
        fields = ["id", "doctor", "clinic", "day_of_week", "day_label", "start_time", "end_time"]


# =============================================================================
# MEETING  — the main appointment serializer
# =============================================================================

class MeetingSerializer(serializers.ModelSerializer):
    """
    Used for listing appointments on the calendar and showing the appointment card.
    Includes nested doctor and patient names for easy display in React.
    """

    # Read-only computed fields for display (not stored separately)
    doctor_name  = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()
    clinic_name  = serializers.SerializerMethodField()

    # Human-readable versions of choice fields
    meeting_type_label      = serializers.CharField(source="get_meeting_type_display",      read_only=True)
    appointment_type_label  = serializers.CharField(source="get_appointment_type_display",  read_only=True)
    status_label            = serializers.CharField(source="get_status_display",             read_only=True)

    class Meta:
        model  = Meeting
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


class MeetingCreateSerializer(serializers.ModelSerializer):
    """
    Lighter serializer used only for CREATING a new appointment booking.
    The patient or admin sends this data to POST /api/book-appointment/
    """
    class Meta:
        model  = Meeting
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


# =============================================================================
# LEGACY — kept for backward compatibility with old Appointment/Consultation
# =============================================================================

class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Patient
        fields = "__all__"