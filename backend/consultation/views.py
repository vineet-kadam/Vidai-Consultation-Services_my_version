# consultation/views.py
#
# KEY FIX: _is_doctor_available_now() and check_doctor_available() now use
# timezone.localtime() so the time comparison uses your local timezone
# (e.g. IST 09:58) instead of UTC (04:28).
#
# REQUIRED settings.py change:
#   TIME_ZONE = "Asia/Kolkata"   ← set to YOUR timezone
#   USE_TZ    = True             ← keep True

import traceback
from datetime import datetime

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Clinic, Meeting, UserProfile, DoctorAvailability, Patient
from .serializers import (
    DoctorAvailabilitySerializer,
    MeetingSerializer,
    UserSerializer,
)


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

    role = "doctor"
    if hasattr(user, "profile"):
        role = user.profile.role
    elif user.is_superuser:
        role = "admin"

    refresh = RefreshToken.for_user(user)
    return Response({
        "access"      : str(refresh.access_token),
        "refresh"     : str(refresh),
        "role"        : role,
        "is_superuser": user.is_superuser,
        "is_staff"    : user.is_staff,
        "username"    : user.username,
        "full_name"   : user.get_full_name(),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_profile(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


# =============================================================================
# ADMIN
# =============================================================================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_user(request):
    if not (request.user.is_staff or request.user.is_superuser):
        return Response({"error": "Admin only"}, status=403)

    username   = request.data.get("username")
    password   = request.data.get("password")
    first_name = request.data.get("first_name", "")
    last_name  = request.data.get("last_name", "")
    email      = request.data.get("email", "")
    role       = request.data.get("role", "patient")
    mobile     = request.data.get("mobile", "")
    dob        = request.data.get("date_of_birth")
    sex        = request.data.get("sex", "")
    clinic_id  = request.data.get("clinic")
    department = request.data.get("department", "")

    if not username or not password:
        return Response({"error": "username and password required"}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({"error": "Username already taken"}, status=400)

    user = User.objects.create_user(
        username=username, password=password,
        first_name=first_name, last_name=last_name, email=email,
    )
    clinic = Clinic.objects.filter(id=clinic_id).first() if clinic_id else None
    UserProfile.objects.create(
        user=user, role=role, mobile=mobile,
        date_of_birth=dob or None, sex=sex,
        clinic=clinic, department=department,
    )
    return Response({"id": user.id, "username": user.username,
                     "full_name": user.get_full_name(), "role": role}, status=201)


# =============================================================================
# CLINICS
# =============================================================================

@api_view(["GET"])
def get_clinics(request):
    clinics = Clinic.objects.all()
    return Response([{"id": c.id, "name": c.name, "clinic_id": c.clinic_id} for c in clinics])


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
# DOCTORS
# =============================================================================

@api_view(["GET"])
def get_doctors(request):
    clinic_id = request.query_params.get("clinic")
    doctors   = User.objects.filter(profile__role="doctor").select_related("profile")
    if clinic_id:
        doctors = doctors.filter(profile__clinic_id=clinic_id)
    result = []
    for d in doctors:
        p = getattr(d, "profile", None)
        result.append({
            "id": d.id, "full_name": d.get_full_name() or d.username,
            "username": d.username,
            "department": p.department if p else "",
            "clinic": p.clinic.name if (p and p.clinic) else "",
        })
    return Response(result)


@api_view(["GET"])
def get_doctor_availability(request, doctor_id):
    avail      = DoctorAvailability.objects.filter(doctor_id=doctor_id)
    serializer = DoctorAvailabilitySerializer(avail, many=True)
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_doctor_availability(request):
    """
    POST /api/doctor/set-availability/
    Doctor sets working hours for a clinic + day.

    The times (start_time, end_time) should be entered in local time.
    Make sure TIME_ZONE in settings.py matches your local timezone.
    """
    if not hasattr(request.user, "profile") or request.user.profile.role != "doctor":
        return Response({"error": "Doctors only"}, status=403)

    clinic_id  = request.data.get("clinic")
    day        = request.data.get("day_of_week")
    start_time = request.data.get("start_time")
    end_time   = request.data.get("end_time")

    if clinic_id is None or day is None or not start_time or not end_time:
        return Response({"error": "clinic, day_of_week, start_time, end_time required"}, status=400)

    clinic = get_object_or_404(Clinic, id=clinic_id)
    avail, created = DoctorAvailability.objects.update_or_create(
        doctor=request.user, clinic=clinic, day_of_week=int(day),
        defaults={"start_time": start_time, "end_time": end_time},
    )
    serializer = DoctorAvailabilitySerializer(avail)
    return Response(serializer.data, status=201 if created else 200)


# =============================================================================
# ★ FIXED: _is_doctor_available_now — the root cause of the bug ★
#
# OLD (broken):
#   now = timezone.now()          → UTC time e.g. 04:28
#   cur_time = now.time()         → 04:28  ← compared against "09:00" → False
#
# NEW (fixed):
#   now_local = timezone.localtime(timezone.now())  → IST e.g. 09:58
#   cur_time = now_local.time()                     → 09:58 → True ✅
#
# REQUIREMENT: Set TIME_ZONE = "Asia/Kolkata" in settings.py
# =============================================================================

def _is_doctor_available_now(doctor_id):
    """
    Returns True if the doctor is currently within their working hours.
    Uses LOCAL time (from TIME_ZONE in settings.py), not UTC.
    """
    # localtime() converts UTC now → local timezone set in settings.py
    now_local = timezone.localtime(timezone.now())
    today     = now_local.weekday()   # 0=Monday … 6=Sunday
    cur_time  = now_local.time()      # e.g. 09:58 (IST) instead of 04:28 (UTC)

    # Print to Django console for debugging — remove after fix is confirmed
    print(
        f"[avail-check] doctor={doctor_id} | "
        f"local={cur_time.strftime('%H:%M')} | "
        f"day={today}({['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][today]}) | "
        f"tz={timezone.get_current_timezone()}"
    )

    found = DoctorAvailability.objects.filter(
        doctor_id       = doctor_id,
        day_of_week     = today,
        start_time__lte = cur_time,
        end_time__gte   = cur_time,
    ).exists()

    print(f"[avail-check] matched={found}")
    return found


@api_view(["GET"])
def check_doctor_available(request, doctor_id):
    """
    GET /api/doctor/available/<doctor_id>/
    Returns available + debug info so you can diagnose time mismatches.
    """
    now_local = timezone.localtime(timezone.now())
    available = _is_doctor_available_now(doctor_id)

    # Fetch what rows exist so you can see if the day/time is saved correctly
    rows = list(
        DoctorAvailability.objects.filter(doctor_id=doctor_id).values(
            "day_of_week", "start_time", "end_time", "clinic__name"
        )
    )

    return Response({
        "available" : available,
        "doctor_id" : doctor_id,
        # ── Debug block — shows you exactly what Django is checking ──────────
        # Open this URL in your browser to diagnose any mismatch:
        # http://localhost:8000/api/doctor/available/<id>/
        "debug": {
            "server_local_time"  : now_local.strftime("%H:%M:%S"),
            "server_local_day"   : now_local.strftime("%A"),
            "server_weekday_int" : now_local.weekday(),
            "server_timezone"    : str(timezone.get_current_timezone()),
            "availability_rows"  : rows,
        }
    })


# =============================================================================
# MEETINGS / APPOINTMENTS
# =============================================================================

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def book_appointment(request):
    try:
        clinic_id  = request.data.get("clinic")
        doctor_id  = request.data.get("doctor")
        appt_type  = request.data.get("appointment_type", "consultation")
        reason     = request.data.get("appointment_reason", "")
        sched_time = request.data.get("scheduled_time")
        duration   = request.data.get("duration", 30)
        department = request.data.get("department", "")
        remark     = request.data.get("remark", "")

        if not clinic_id or not doctor_id or not sched_time:
            return Response({"error": "clinic, doctor, scheduled_time required"}, status=400)

        clinic = get_object_or_404(Clinic, id=clinic_id)
        doctor = get_object_or_404(User,   id=doctor_id)

        sched_dt    = datetime.fromisoformat(sched_time)
        day_of_week = sched_dt.weekday()
        slot_time   = sched_dt.time()

        slot_ok = DoctorAvailability.objects.filter(
            doctor=doctor, clinic=clinic, day_of_week=day_of_week,
            start_time__lte=slot_time, end_time__gte=slot_time,
        ).exists()

        if not slot_ok:
            return Response({
                "error": (
                    f"Dr. {doctor.get_full_name()} is not available on "
                    f"{sched_dt.strftime('%A')} at {sched_dt.strftime('%H:%M')}."
                )
            }, status=400)

        participants = [
            {"name": doctor.get_full_name() or doctor.username, "email": doctor.email, "role": "doctor"},
            {"name": request.user.get_full_name() or request.user.username, "email": request.user.email, "role": "patient"},
        ]

        meeting = Meeting.objects.create(
            meeting_type=      "CONSULT",
            appointment_type=  appt_type,
            scheduled_time=    sched_time,
            duration=          duration,
            participants=      participants,
            patient=           request.user,
            doctor=            doctor,
            clinic=            clinic,
            appointment_reason=reason,
            department=        department,
            remark=            remark,
            status=            "scheduled",
        )

        return Response({
            "meeting_id"    : meeting.meeting_id,
            "room_id"       : meeting.room_id,
            "scheduled_time": str(meeting.scheduled_time),
            "status"        : meeting.status,
        }, status=201)

    except Exception:
        print(traceback.format_exc())
        return Response({"error": "Failed to book appointment"}, status=500)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_patient_appointments(request):
    meetings = Meeting.objects.filter(
        patient=request.user
    ).select_related("doctor", "clinic").order_by("scheduled_time")
    return Response(MeetingSerializer(meetings, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_doctor_appointments(request):
    clinic_id = request.query_params.get("clinic")
    meetings  = Meeting.objects.filter(
        doctor=request.user
    ).select_related("patient", "clinic").order_by("scheduled_time")
    if clinic_id:
        meetings = meetings.filter(clinic_id=clinic_id)
    return Response(MeetingSerializer(meetings, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_meeting(request, meeting_id):
    meeting = get_object_or_404(Meeting, meeting_id=meeting_id)
    return Response(MeetingSerializer(meeting).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_meeting(request):
    """
    POST /api/meeting/start/
    Uses the fixed _is_doctor_available_now() — local time comparison.
    Returns debug info in the error message so you know what went wrong.
    """
    try:
        meeting_id = request.data.get("meeting_id")
        if not meeting_id:
            return Response({"error": "meeting_id required"}, status=400)

        meeting = get_object_or_404(Meeting, meeting_id=meeting_id)

        if meeting.status == "ended":
            return Response({"error": "This appointment has already ended"}, status=400)

        if meeting.doctor and not _is_doctor_available_now(meeting.doctor_id):
            now_local = timezone.localtime(timezone.now())
            # Fetch the actual rows to show in the error
            rows = list(DoctorAvailability.objects.filter(
                doctor_id=meeting.doctor_id
            ).values("day_of_week", "start_time", "end_time"))
            return Response({
                "error": (
                    f"Doctor is not available right now. "
                    f"Current local time: {now_local.strftime('%A %H:%M')} "
                    f"(timezone: {timezone.get_current_timezone()}). "
                    f"Doctor's saved hours: {rows}. "
                    "Make sure TIME_ZONE in settings.py is set correctly."
                ),
                "doctor_available"  : False,
                "server_local_time" : now_local.strftime("%H:%M"),
                "server_day"        : now_local.strftime("%A"),
                "availability_rows" : rows,
            }, status=400)

        meeting.status = "started"
        meeting.save()

        patient_url = f"http://localhost:3000/patient/{meeting.room_id}?meeting_id={meeting.meeting_id}"
        return Response({
            "room_id"         : meeting.room_id,
            "meeting_id"      : meeting.meeting_id,
            "patient_url"     : patient_url,
            "doctor_available": True,
        })

    except Exception:
        print(traceback.format_exc())
        return Response({"error": "Failed to start meeting"}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end_meeting(request):
    try:
        meeting_id     = request.data.get("meeting_id")
        speech_to_text = request.data.get("speech_to_text", "")
        meeting = get_object_or_404(Meeting, meeting_id=meeting_id)
        meeting.status         = "ended"
        meeting.speech_to_text = speech_to_text
        meeting.save()
        return Response({"status": "ended", "meeting_id": meeting.meeting_id})
    except Exception:
        print(traceback.format_exc())
        return Response({"error": "Failed to end meeting"}, status=500)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def append_transcript(request):
    try:
        meeting_id = request.data.get("meeting_id")
        line       = (request.data.get("line") or "").strip()
        if not meeting_id or not line:
            return Response({"error": "meeting_id and line required"}, status=400)
        meeting = get_object_or_404(Meeting, meeting_id=meeting_id)
        meeting.speech_to_text = f"{meeting.speech_to_text}\n{line}" if meeting.speech_to_text else line
        meeting.save()
        return Response({"status": "appended"})
    except Exception:
        print(traceback.format_exc())
        return Response({"error": "Failed to append transcript"}, status=500)


# =============================================================================
# PATIENTS
# =============================================================================

@api_view(["GET"])
def get_patients_by_clinic(request, clinic_id):
    patients = Patient.objects.filter(clinic_id=clinic_id)
    return Response([{"id": p.id, "full_name": p.full_name, "patient_id": p.patient_id} for p in patients])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_patients(request):
    clinic_id = request.query_params.get("clinic")
    patients  = User.objects.filter(profile__role="patient").select_related("profile")
    if clinic_id:
        patients = patients.filter(profile__clinic_id=clinic_id)
    result = []
    for p in patients:
        prof = getattr(p, "profile", None)
        result.append({
            "id": p.id, "full_name": p.get_full_name() or p.username,
            "username": p.username, "email": p.email,
            "mobile": prof.mobile if prof else "",
        })
    return Response(result)