"""
consultation/views.py

Whisper / FFmpeg completely removed.
STT is now handled in real-time by STTConsumer (consumers.py) via Deepgram.

Two notes endpoints:
  POST api/save-notes/        → full overwrite (manual save + end-call + auto-save)
  POST api/append-transcript/ → append a single line in real-time (called per Deepgram result)
"""

import traceback

from django.contrib.auth import authenticate
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Appointment, Clinic, Consultation, Patient


# =============================================================================
# CLINICS
# =============================================================================

@api_view(["GET"])
def get_clinics(request):
    clinics = Clinic.objects.all()
    return Response([
        {"id": c.id, "name": c.name, "clinic_id": c.clinic_id}
        for c in clinics
    ])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_clinic(request):
    if not request.user.is_staff:
        return Response({"error": "Admin only"}, status=403)

    name      = request.data.get("name")
    clinic_id = request.data.get("clinic_id")

    if not name or not clinic_id:
        return Response({"error": "name and clinic_id required"}, status=400)

    if Clinic.objects.filter(clinic_id=clinic_id).exists():
        return Response({"error": "clinic_id already exists"}, status=400)

    clinic = Clinic.objects.create(name=name, clinic_id=clinic_id)
    return Response({"id": clinic.id, "name": clinic.name, "clinic_id": clinic.clinic_id}, status=201)


# =============================================================================
# PATIENTS
# =============================================================================

@api_view(["GET"])
def get_patients_by_clinic(request, clinic_id):
    patients = Patient.objects.filter(clinic_id=clinic_id)
    return Response([
        {"id": p.id, "full_name": p.full_name, "patient_id": p.patient_id}
        for p in patients
    ])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_patient(request):
    if not request.user.is_staff:
        return Response({"error": "Admin only"}, status=403)

    clinic_id  = request.data.get("clinic")
    full_name  = request.data.get("full_name")
    patient_id = request.data.get("patient_id")

    if not clinic_id or not full_name or not patient_id:
        return Response({"error": "clinic, full_name, patient_id required"}, status=400)

    if Patient.objects.filter(patient_id=patient_id).exists():
        return Response({"error": "patient_id already exists"}, status=400)

    clinic  = get_object_or_404(Clinic, id=clinic_id)
    patient = Patient.objects.create(clinic=clinic, full_name=full_name, patient_id=patient_id)
    return Response({"id": patient.id, "full_name": patient.full_name, "patient_id": patient.patient_id}, status=201)


# =============================================================================
# CONSULTATION
# =============================================================================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_consultation(request):
    clinic_id  = request.data.get("clinic")
    patient_id = request.data.get("patient")

    clinic  = get_object_or_404(Clinic,  id=clinic_id)
    patient = get_object_or_404(Patient, id=patient_id)

    appointment = Appointment.objects.create(
        doctor=request.user, clinic=clinic, patient=patient, status="active"
    )
    consultation = Consultation.objects.create(
        doctor=request.user, clinic=clinic, patient=patient, status="active"
    )
    appointment.consultation = consultation
    appointment.save()

    return Response({
        "appointment_id" : appointment.id,
        "consultation_id": consultation.id,
        "room_id"        : appointment.room_id,
        "patient_url"    : (
            f"http://localhost:3000/patient/{appointment.room_id}"
            f"?appointment_id={appointment.id}"
        ),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end_consultation(request):
    consultation_id = request.data.get("consultation_id")
    consultation    = get_object_or_404(Consultation, id=consultation_id)
    consultation.status = "completed"
    consultation.save()
    return Response({"status": "ended"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_consultation(request, consultation_id):
    consultation = get_object_or_404(Consultation, id=consultation_id)
    return Response({
        "id"        : consultation.id,
        "notes"     : consultation.notes,
        "status"    : consultation.status,
        "created_at": consultation.created_at,
    })


# =============================================================================
# NOTES — two endpoints, both always persist
# =============================================================================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def save_notes(request):
    """
    Full overwrite of consultation notes.
    Called by:
      • Manual "Save Notes" button click
      • End Call (always, before teardown)
      • Auto-save timer every 10 s
    Always saves regardless of whether notes is empty.
    """
    try:
        consultation_id = request.data.get("consultation")
        notes           = request.data.get("notes", "")

        if not consultation_id:
            return Response({"error": "consultation id required"}, status=400)

        consultation       = get_object_or_404(Consultation, id=consultation_id)
        consultation.notes = notes
        consultation.save()
        return Response({"status": "saved", "notes": consultation.notes})

    except Exception:
        print(traceback.format_exc())
        return Response({"error": "Failed to save notes"}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def append_transcript(request):
    """
    Append a single labelled transcript line to consultation notes in real-time.
    Called by the frontend on every Deepgram is_final result.

    Body: { "consultation_id": <int>, "line": "Doctor: hello there" }
    """
    try:
        consultation_id = request.data.get("consultation_id")
        line            = (request.data.get("line") or "").strip()

        if not consultation_id or not line:
            return Response({"error": "consultation_id and line required"}, status=400)

        consultation = get_object_or_404(Consultation, id=consultation_id)

        if consultation.notes:
            consultation.notes = f"{consultation.notes}\n{line}"
        else:
            consultation.notes = line

        consultation.save()
        return Response({"status": "appended", "notes": consultation.notes})

    except Exception:
        print(traceback.format_exc())
        return Response({"error": "Failed to append transcript"}, status=500)


# =============================================================================
# AUTH
# =============================================================================

@api_view(["POST"])
def login_view(request):
    username = request.data.get("username")
    password = request.data.get("password")

    user = authenticate(username=username, password=password)
    if user is None:
        return Response({"error": "Invalid credentials"}, status=401)

    refresh = RefreshToken.for_user(user)
    return Response({
        "access"      : str(refresh.access_token),
        "refresh"     : str(refresh),
        "is_superuser": user.is_superuser,
        "is_staff"    : user.is_staff,
        "username"    : user.username,
    })