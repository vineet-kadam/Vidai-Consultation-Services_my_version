from django.db import models
from django.contrib.auth.models import User
import uuid


class Clinic(models.Model):
    clinic_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)

    def __str__(self):
        return f"{self.name} ({self.clinic_id})"


class Patient(models.Model):
    patient_id = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=100, null=True, blank=True)
    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )

    def __str__(self):
        return f"{self.full_name} ({self.patient_id})"


class Consultation(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    doctor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="consultations",
        null=True,
        blank=True
    )

    clinic = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="consultations"
    )

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="consultations"
    )

    notes = models.TextField(max_length=2000, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.patient.patient_id} - {self.status}"


class Appointment(models.Model):
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name="doctor_appointments")
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE)
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE)

    consultation = models.OneToOneField(
        "Consultation",
        on_delete=models.CASCADE,
        related_name="appointment",
        null=True,
        blank=True
    )

    room_id = models.CharField(max_length=120, unique=True, blank=True)
    start_time = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, default="scheduled")

    def save(self, *args, **kwargs):
        if not self.room_id:
            self.room_id = f"consult-{uuid.uuid4()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.room_id} - {self.status}"