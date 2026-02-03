"""
consultation/views.py
"""

from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Patient, Consultation, Clinic, Appointment
from .serializers import SpeechToTextSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
import tempfile
import os
import subprocess
import whisper

# Load Whisper Model
whisper_model = whisper.load_model("small")


# ==================== UTILITY FUNCTIONS ====================
def convert_to_wav(uploaded_file):
    """Convert audio file to WAV format"""
    suffix = os.path.splitext(uploaded_file.name)[1]

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_input:
        for chunk in uploaded_file.chunks():
            temp_input.write(chunk)
        input_path = temp_input.name

    output_fd, output_path = tempfile.mkstemp(suffix=".wav")
    os.close(output_fd)

    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, output_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )

    os.remove(input_path)
    return output_path


def transcribe_audio(path):
    """Transcribe audio using Whisper"""
    result = whisper_model.transcribe(path)
    os.remove(path)
    return result.get("text", "").strip()


# ==================== SPEECH TO TEXT ====================
@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def speech_to_text(request):
    """Convert audio to text and save to consultation"""
    serializer = SpeechToTextSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    try:
        audio_file = serializer.validated_data["audio"]
        appointment_id = serializer.validated_data["appointment_id"]

        # Convert and transcribe
        wav_path = convert_to_wav(audio_file)
        text = transcribe_audio(wav_path)

        # Save to consultation
        appointment = Appointment.objects.get(id=appointment_id)
        if appointment.consultation:
            consultation = appointment.consultation
            consultation.notes += f"\n{text}"
            consultation.save()

        return Response({"text": text}, status=200)

    except Exception as e:
        return Response({"error": str(e)}, status=500)


# ==================== CLINICS ====================
@api_view(["GET"])
def get_clinics(request):
    """Get all clinics"""
    clinics = Clinic.objects.all()
    return Response([{"id": c.id, "name": c.name, "clinic_id": c.clinic_id} for c in clinics])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_clinic(request):
    """Create new clinic (Admin only)"""
    if not request.user.is_staff:
        return Response({"error": "Admin only"}, status=403)

    name = request.data.get("name")
    clinic_id = request.data.get("clinic_id")

    if not name or not clinic_id:
        return Response({"error": "name and clinic_id required"}, status=400)

    if Clinic.objects.filter(clinic_id=clinic_id).exists():
        return Response({"error": "clinic_id already exists"}, status=400)

    clinic = Clinic.objects.create(name=name, clinic_id=clinic_id)
    return Response({"id": clinic.id, "name": clinic.name, "clinic_id": clinic.clinic_id}, status=201)


# ==================== PATIENTS ====================
@api_view(["GET"])
def get_patients_by_clinic(request, clinic_id):
    """Get patients by clinic ID"""
    patients = Patient.objects.filter(clinic_id=clinic_id)
    return Response([{"id": p.id, "full_name": p.full_name, "patient_id": p.patient_id} for p in patients])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_patient(request):
    """Create new patient (Admin only)"""
    if not request.user.is_staff:
        return Response({"error": "Admin only"}, status=403)

    clinic_id = request.data.get("clinic")
    full_name = request.data.get("full_name")
    patient_id = request.data.get("patient_id")

    if not clinic_id or not full_name or not patient_id:
        return Response({"error": "clinic, full_name, patient_id required"}, status=400)

    if Patient.objects.filter(patient_id=patient_id).exists():
        return Response({"error": "patient_id already exists"}, status=400)

    clinic = Clinic.objects.get(id=clinic_id)
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
    """Start a new consultation"""
    clinic_id = request.data.get("clinic")
    patient_id = request.data.get("patient")

    clinic = get_object_or_404(Clinic, id=clinic_id)
    patient = get_object_or_404(Patient, id=patient_id)

    # Create appointment
    appointment = Appointment.objects.create(
        doctor=request.user,
        clinic=clinic,
        patient=patient,
        status="active"
    )

    # Create consultation
    consultation = Consultation.objects.create(
        doctor=request.user,
        clinic=clinic,
        patient=patient,
        status="active"
    )

    # Link them
    appointment.consultation = consultation
    appointment.save()

    return Response({
        "appointment_id": appointment.id,
        "consultation_id": consultation.id,
        "room_id": appointment.room_id,
        "patient_url": f"http://localhost:3000/patient/{appointment.room_id}"
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end_consultation(request):
    """End consultation"""
    consultation_id = request.data.get("consultation_id")
    consultation = get_object_or_404(Consultation, id=consultation_id)
    
    consultation.status = "completed"
    consultation.save()
    
    return Response({"status": "ended"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def save_notes(request):
    """Save consultation notes"""
    consultation_id = request.data.get("consultation")
    notes = request.data.get("notes")

    consultation = get_object_or_404(Consultation, id=consultation_id)

    if notes:
        consultation.notes = notes
        consultation.save()

    return Response({"status": "saved", "notes": consultation.notes})

@api_view(['POST'])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')

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