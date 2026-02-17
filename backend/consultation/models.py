# consultation/models.py
#
# This file defines all the database tables for the medical consultation app.
# Think of each class as one table in your PostgreSQL database.
# Django auto-creates the actual SQL tables when you run: python manage.py migrate
#
# Models in this file:
#   1. UserProfile     — extra info for every user (role, photo, DOB, etc.)
#   2. Clinic          — a clinic/hospital branch
#   3. DoctorAvailability — hours a doctor works at a specific clinic
#   4. Meeting         — the main appointment/video-call record (central table)
#
# The built-in Django User model already stores: username, password, email, first_name, last_name
# We extend it with UserProfile (OneToOne relationship = one profile per user).

import uuid
from django.db import models
from django.contrib.auth.models import User


# =============================================================================
# 1. USER PROFILE  — one row per user, linked to Django's built-in User table
# =============================================================================

class UserProfile(models.Model):
    """
    Stores extra details about every user.
    Role decides what the user sees after login:
      - 'admin'   → Admin Dashboard
      - 'doctor'  → Doctor Calendar + Video Call
      - 'patient' → Patient Dashboard (calendar, book appointment, join)
    """

    ROLE_CHOICES = [
        ("admin",   "Admin"),
        ("doctor",  "Doctor"),
        ("patient", "Patient"),
    ]

    SEX_CHOICES = [
        ("M", "Male"),
        ("F", "Female"),
        ("O", "Other / Prefer not to say"),
    ]

    # Link to Django's built-in User (username, password, email live there)
    user        = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role        = models.CharField(max_length=10, choices=ROLE_CHOICES, default="patient")
    date_of_birth = models.DateField(null=True, blank=True)
    sex         = models.CharField(max_length=1, choices=SEX_CHOICES, null=True, blank=True)
    mobile      = models.CharField(max_length=20, null=True, blank=True)
    department  = models.CharField(max_length=100, null=True, blank=True)  # e.g. "Cardiology"
    photo       = models.ImageField(upload_to="profile_photos/", null=True, blank=True)

    # Which clinic this doctor/patient belongs to (null for admins)
    clinic      = models.ForeignKey(
        "Clinic",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="members"
    )

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.role})"


# =============================================================================
# 2. CLINIC  — a hospital branch / clinic location
# =============================================================================

class Clinic(models.Model):
    """
    Represents a clinic or hospital branch.
    Doctors can work at one or more clinics.
    Patients are assigned to a clinic.
    """
    clinic_id = models.CharField(max_length=50, unique=True)   # e.g. "CLINIC-001"
    name      = models.CharField(max_length=100)                # e.g. "Downtown Medical Centre"

    def __str__(self):
        return f"{self.name} ({self.clinic_id})"


# =============================================================================
# 3. DOCTOR AVAILABILITY  — when a doctor is available at a clinic
# =============================================================================

class DoctorAvailability(models.Model):
    """
    Stores the working hours of a doctor at a specific clinic.
    Example: Dr. Smith works at City Clinic on Mon/Wed 09:00-17:00

    The patient's "Start Appointment" button is GREEN only when the current time
    falls inside the doctor's availability window for today.
    """

    DAY_CHOICES = [
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
        (6, "Sunday"),
    ]

    doctor     = models.ForeignKey(User,   on_delete=models.CASCADE, related_name="availability")
    clinic     = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name="doctor_hours")
    day_of_week = models.IntegerField(choices=DAY_CHOICES)  # 0 = Monday, 6 = Sunday
    start_time = models.TimeField()   # e.g. 09:00
    end_time   = models.TimeField()   # e.g. 17:00

    class Meta:
        # Prevent duplicate entries for same doctor/clinic/day
        unique_together = ("doctor", "clinic", "day_of_week")
        ordering = ["day_of_week", "start_time"]

    def __str__(self):
        return (
            f"Dr.{self.doctor.get_full_name()} @ {self.clinic.name} "
            f"— {self.get_day_of_week_display()} {self.start_time}–{self.end_time}"
        )


# =============================================================================
# 4. MEETING  — the central record for every video consultation
#
# This matches the required DB structure from the spec:
#   meeting_id, room_id, meeting_type, scheduled_time, duration,
#   participants (JSON), patient_id, doctor_id, speech_to_text, status
#   + appointment fields: type, reason, department, remark
# =============================================================================

class Meeting(models.Model):
    """
    One row = one scheduled/completed video consultation appointment.

    Flow:
      Patient books  →  status = 'scheduled'
      Doctor/Patient joins  →  status = 'started'
      Call ends  →  status = 'ended', speech_to_text filled in
    """

    # ── Meeting type choices ──────────────────────────────────────────────────
    MEETING_TYPE_CHOICES = [
        ("CONSULT", "Consultation"),
        ("SALES",   "Sales"),
        ("DEMO",    "Demo"),
    ]

    # ── Appointment type choices (what kind of visit) ─────────────────────────
    APPOINTMENT_TYPE_CHOICES = [
        ("consultation",     "Consultation"),
        ("semen_collection", "Semen Collection"),
        ("pathology",        "Pathology"),
        ("ultrasound",       "Ultrasound"),
        ("surgery",          "Surgery"),
    ]

    # ── Status choices ────────────────────────────────────────────────────────
    STATUS_CHOICES = [
        ("scheduled", "Scheduled"),
        ("started",   "Started"),
        ("ended",     "Ended"),
        ("cancelled", "Cancelled"),
    ]

    # ── Primary Key fields ────────────────────────────────────────────────────
    # Auto-increment integer PK (meeting_id)
    meeting_id     = models.AutoField(primary_key=True)

    # Unique video room identifier — generated automatically using UUID
    room_id        = models.CharField(max_length=120, unique=True, blank=True)

    # ── Meeting metadata ──────────────────────────────────────────────────────
    meeting_type        = models.CharField(max_length=20, choices=MEETING_TYPE_CHOICES, default="CONSULT")
    appointment_type    = models.CharField(max_length=30, choices=APPOINTMENT_TYPE_CHOICES, default="consultation")
    scheduled_time      = models.DateTimeField()        # when the appointment is booked for
    duration            = models.IntegerField(default=30)  # in minutes

    # ── Participants — stored as JSON array ───────────────────────────────────
    # Example: [{"name": "Dr. Smith", "email": "smith@clinic.com", "role": "doctor"},
    #           {"name": "John Doe",  "email": "john@gmail.com",   "role": "patient"}]
    participants        = models.JSONField(default=list)

    # ── Foreign Keys ──────────────────────────────────────────────────────────
    patient             = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="patient_meetings"
    )
    doctor              = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="doctor_meetings"
    )
    clinic              = models.ForeignKey(
        Clinic, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="meetings"
    )

    # ── Appointment booking details (the 13 fields shown in the card) ─────────
    appointment_reason  = models.CharField(max_length=300, blank=True)
    department          = models.CharField(max_length=100, blank=True)   # e.g. "Cardiology"
    remark              = models.TextField(blank=True)

    # ── Call output ───────────────────────────────────────────────────────────
    # Full transcript from Deepgram STT, stored as:
    # "Doctor: Hello, how are you feeling?\nPatient: I have a headache."
    speech_to_text      = models.TextField(blank=True)

    # ── Status ────────────────────────────────────────────────────────────────
    status              = models.CharField(max_length=20, choices=STATUS_CHOICES, default="scheduled")

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Auto-generate room_id on first save if not already set
        if not self.room_id:
            self.room_id = f"meet-{uuid.uuid4()}"
        super().save(*args, **kwargs)

    def __str__(self):
        patient_name = self.patient.get_full_name() if self.patient else "Unknown"
        doctor_name  = self.doctor.get_full_name()  if self.doctor  else "Unknown"
        return f"Meeting {self.meeting_id}: {patient_name} with Dr.{doctor_name} @ {self.scheduled_time}"


# =============================================================================
# KEEPING OLD MODELS for backward compatibility
# (Clinic is now used by Meeting, UserProfile — the old Appointment and
#  Consultation models are replaced by Meeting)
# =============================================================================

class Patient(models.Model):
    """
    Legacy model — kept for backward compatibility.
    New code uses User + UserProfile with role='patient' instead.
    """
    patient_id = models.CharField(max_length=50, unique=True)
    full_name  = models.CharField(max_length=100, null=True, blank=True)
    clinic     = models.ForeignKey(Clinic, on_delete=models.CASCADE, null=True, blank=True)

    def __str__(self):
        return f"{self.full_name} ({self.patient_id})"