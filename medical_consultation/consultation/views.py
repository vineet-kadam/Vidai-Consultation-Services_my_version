"""
consultation/views.py
"""

from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Patient, Consultation, Clinic, Appointment
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate

import tempfile
import os
import subprocess
import traceback
import threading
from concurrent.futures import ThreadPoolExecutor

import whisper


# ==================== WHISPER SETUP ====================

whisper_model = None
whisper_lock = threading.Lock()

def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        whisper_model = whisper.load_model("small")
    return whisper_model


# Single worker → Whisper is heavy + not thread-safe
whisper_executor = ThreadPoolExecutor(max_workers=1)


# ==================== AUDIO UTILS ====================

def convert_to_wav(uploaded_file):
    """Safely convert uploaded audio to WAV (Windows-safe)"""

    suffix = os.path.splitext(uploaded_file.name)[1]

    # Write input file safely
    input_fd, input_path = tempfile.mkstemp(suffix=suffix)
    os.close(input_fd)

    with open(input_path, "wb") as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)

    # Prepare output file
    output_fd, output_path = tempfile.mkstemp(suffix=".wav")
    os.close(output_fd)

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel", "error",
                "-i", input_path,
                "-ac", "1",
                "-ar", "16000",
                output_path,
            ],
            check=True,
        )
    except subprocess.CalledProcessError as e:
        raise RuntimeError("FFmpeg audio conversion failed") from e
    finally:
        if os.path.exists(input_path):
            os.remove(input_path)

    return output_path


def transcribe_audio(path):
    """Run Whisper transcription (thread-safe + locked)"""
    try:
        with whisper_lock:
            print("🔒 Whisper lock acquired")
            model = get_whisper_model()
            result = model.transcribe(path, fp16=False)
            text = result.get("text", "").strip()
            print("🔓 Whisper transcription complete")
            return text
    finally:
        if os.path.exists(path):
            os.remove(path)


# ==================== SPEECH TO TEXT ====================

@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def speech_to_text(request):
    try:
        audio_file = request.data.get("audio")
        appointment_id = request.data.get("appointment_id")
        speaker = request.data.get("speaker", "unknown")

        speaker_label = "Doctor" if speaker == "doctor" else "Patient"

        if not audio_file:
            return Response({"error": "audio file required"}, status=400)

        if not appointment_id:
            return Response({"error": "appointment_id required"}, status=400)

        appointment = get_object_or_404(Appointment, id=appointment_id)

        # Ignore tiny packets (WebRTC noise)
        if audio_file.size < 8000:
            return Response({
                "text": "",
                "speaker": speaker_label,
                "skipped": True
            })

        wav_path = convert_to_wav(audio_file)

        # Run Whisper OFF the request thread
        future = whisper_executor.submit(transcribe_audio, wav_path)
        text = future.result()

        if appointment.consultation and text:
            consultation = appointment.consultation
            labeled_text = f"{speaker_label}: {text}"

            consultation.notes = (
                f"{consultation.notes}\n{labeled_text}"
                if consultation.notes else labeled_text
            )
            consultation.save()

        return Response({
            "text": text,
            "speaker": speaker_label,
            "skipped": False
        })

    except Exception:
        print(traceback.format_exc())
        return Response({"error": "Speech-to-text failed"}, status=500)


# ==================== CLINICS ====================

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

    name = request.data.get("name")
    clinic_id = request.data.get("clinic_id")

    if not name or not clinic_id:
        return Response({"error": "name and clinic_id required"}, status=400)

    if Clinic.objects.filter(clinic_id=clinic_id).exists():
        return Response({"error": "clinic_id already exists"}, status=400)

    clinic = Clinic.objects.create(name=name, clinic_id=clinic_id)
    return Response({
        "id": clinic.id,
        "name": clinic.name,
        "clinic_id": clinic.clinic_id
    }, status=201)


# ==================== PATIENTS ====================

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

    clinic_id = request.data.get("clinic")
    full_name = request.data.get("full_name")
    patient_id = request.data.get("patient_id")

    if not clinic_id or not full_name or not patient_id:
        return Response({"error": "clinic, full_name, patient_id required"}, status=400)

    if Patient.objects.filter(patient_id=patient_id).exists():
        return Response({"error": "patient_id already exists"}, status=400)

    clinic = get_object_or_404(Clinic, id=clinic_id)

    patient = Patient.objects.create(
        clinic=clinic,
        full_name=full_name,
        patient_id=patient_id
    )

    return Response({
        "id": patient.id,
        "full_name": patient.full_name,
        "patient_id": patient.patient_id
    }, status=201)


# ==================== CONSULTATION ====================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_consultation(request):
    clinic_id = request.data.get("clinic")
    patient_id = request.data.get("patient")

    clinic = get_object_or_404(Clinic, id=clinic_id)
    patient = get_object_or_404(Patient, id=patient_id)

    appointment = Appointment.objects.create(
        doctor=request.user,
        clinic=clinic,
        patient=patient,
        status="active"
    )

    consultation = Consultation.objects.create(
        doctor=request.user,
        clinic=clinic,
        patient=patient,
        status="active"
    )

    appointment.consultation = consultation
    appointment.save()

    return Response({
        "appointment_id": appointment.id,
        "consultation_id": consultation.id,
        "room_id": appointment.room_id,
        "patient_url": f"http://localhost:3000/patient/{appointment.room_id}?appointment_id={appointment.id}"
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end_consultation(request):
    consultation_id = request.data.get("consultation_id")
    consultation = get_object_or_404(Consultation, id=consultation_id)

    consultation.status = "completed"
    consultation.save()

    return Response({"status": "ended"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_consultation(request, consultation_id):
    consultation = get_object_or_404(Consultation, id=consultation_id)
    return Response({
        "id": consultation.id,
        "notes": consultation.notes,
        "status": consultation.status,
        "created_at": consultation.created_at,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def save_notes(request):
    consultation_id = request.data.get("consultation")
    notes = request.data.get("notes")

    consultation = get_object_or_404(Consultation, id=consultation_id)

    if notes:
        consultation.notes = notes
        consultation.save()

    return Response({"status": "saved", "notes": consultation.notes})


# ==================== AUTH ====================

@api_view(["POST"])
def login_view(request):
    username = request.data.get("username")
    password = request.data.get("password")

    user = authenticate(username=username, password=password)
    if user is None:
        return Response({"error": "Invalid credentials"}, status=401)

    refresh = RefreshToken.for_user(user)

    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "is_superuser": user.is_superuser,
        "is_staff": user.is_staff,
        "username": user.username
    })
