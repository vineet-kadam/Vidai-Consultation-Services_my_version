# consultation/views.py -- FIXED
# Bug fixes:
#  1. MeetingStartView: patients/sales can join if meeting is already "started"
#     (doctor availability check only blocks if doctor hasn't started it yet)
#  2. New DoctorAvailableSlotsView: returns 30-min time slots for a given doctor+date
#  3. LoginView: properly returns user_id for sales rep self-booking

import traceback
from datetime import datetime, timedelta

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Clinic, Meeting, UserProfile, DoctorAvailability
from .serializers import (
    DoctorAvailabilitySerializer,
    MeetingSerializer,
    UserSerializer,
)


# =============================================================================
# AUTHENTICATION
# =============================================================================

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(username=username, password=password)
        if user is None:
            return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

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
            "user_id"     : user.id,
        })


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


# =============================================================================
# USER MANAGEMENT
# =============================================================================

class UserCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response({"error": "Admin privileges required"}, status=status.HTTP_403_FORBIDDEN)

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
            return Response({"error": "username and password are required"}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({"error": "Username already taken"}, status=status.HTTP_400_BAD_REQUEST)

        valid_roles = [r[0] for r in UserProfile.ROLE_CHOICES]
        if role not in valid_roles:
            return Response({"error": f"Invalid role. Must be one of: {valid_roles}"}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(
            username=username, password=password,
            first_name=first_name, last_name=last_name, email=email,
        )
        clinic = Clinic.objects.filter(id=clinic_id).first() if clinic_id else None
        UserProfile.objects.create(
            user=user, role=role, mobile=mobile,
            date_of_birth=dob or None, sex=sex, clinic=clinic, department=department,
        )
        return Response({"id": user.id, "username": user.username, "full_name": user.get_full_name(), "role": role},
                        status=status.HTTP_201_CREATED)


class PatientListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        clinic_id = request.query_params.get("clinic")
        patients = User.objects.filter(profile__role="patient").select_related("profile")
        if clinic_id:
            patients = patients.filter(profile__clinic_id=clinic_id)
        return Response([{
            "id": p.id, "full_name": p.get_full_name() or p.username,
            "username": p.username, "email": p.email,
            "mobile": getattr(p, "profile", None) and p.profile.mobile or "",
        } for p in patients])


class SalesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        clinic_id = request.query_params.get("clinic")
        sales = User.objects.filter(profile__role="sales").select_related("profile")
        if clinic_id:
            sales = sales.filter(profile__clinic_id=clinic_id)
        result = []
        for s in sales:
            prof = getattr(s, "profile", None)
            result.append({
                "id": s.id, "full_name": s.get_full_name() or s.username,
                "username": s.username, "email": s.email,
                "clinic": prof.clinic.name if (prof and prof.clinic) else "",
            })
        return Response(result)


# =============================================================================
# CLINIC MANAGEMENT
# =============================================================================

class ClinicListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        clinics = Clinic.objects.all()
        return Response([{"id": c.id, "name": c.name, "clinic_id": c.clinic_id} for c in clinics])

    def post(self, request):
        if not request.user.is_staff:
            return Response({"error": "Admin privileges required"}, status=status.HTTP_403_FORBIDDEN)
        name      = request.data.get("name")
        clinic_id = request.data.get("clinic_id")
        if not name or not clinic_id:
            return Response({"error": "name and clinic_id are required"}, status=status.HTTP_400_BAD_REQUEST)
        if Clinic.objects.filter(clinic_id=clinic_id).exists():
            return Response({"error": "clinic_id already exists"}, status=status.HTTP_400_BAD_REQUEST)
        clinic = Clinic.objects.create(name=name, clinic_id=clinic_id)
        return Response({"id": clinic.id, "name": clinic.name, "clinic_id": clinic.clinic_id},
                        status=status.HTTP_201_CREATED)


# =============================================================================
# DOCTOR MANAGEMENT
# =============================================================================

class DoctorListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        clinic_id = request.query_params.get("clinic")
        doctors = User.objects.filter(profile__role="doctor").select_related("profile")
        if clinic_id:
            doctors = doctors.filter(profile__clinic_id=clinic_id)
        return Response([{
            "id": d.id, "full_name": d.get_full_name() or d.username,
            "username": d.username,
            "department": getattr(d, "profile", None) and d.profile.department or "",
            "clinic": (getattr(d, "profile", None) and d.profile.clinic and d.profile.clinic.name) or "",
        } for d in doctors])


class DoctorAvailabilityView(APIView):
    """GET  /api/doctor/availability/<doctor_id>/  — list
       POST /api/doctor/set-availability/          — create/update"""

    permission_classes = [AllowAny]

    def get(self, request, doctor_id):
        availability = DoctorAvailability.objects.filter(doctor_id=doctor_id)
        return Response(DoctorAvailabilitySerializer(availability, many=True).data)

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
        if not hasattr(request.user, "profile") or request.user.profile.role != "doctor":
            return Response({"error": "Doctors only"}, status=status.HTTP_403_FORBIDDEN)

        clinic_id  = request.data.get("clinic")
        day        = request.data.get("day_of_week")
        start_time = request.data.get("start_time")
        end_time   = request.data.get("end_time")

        if clinic_id is None or day is None or not start_time or not end_time:
            return Response({"error": "clinic, day_of_week, start_time, end_time are required"},
                            status=status.HTTP_400_BAD_REQUEST)

        clinic = get_object_or_404(Clinic, id=clinic_id)
        avail, created = DoctorAvailability.objects.update_or_create(
            doctor=request.user, clinic=clinic, day_of_week=int(day),
            defaults={"start_time": start_time, "end_time": end_time},
        )
        return Response(DoctorAvailabilitySerializer(avail).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class DoctorAvailabilityCheckView(APIView):
    """GET /api/doctor/available/<doctor_id>/ — is doctor available right now?"""
    permission_classes = [AllowAny]

    def get(self, request, doctor_id):
        now_local = timezone.localtime(timezone.now())
        available = self._is_doctor_available_now(doctor_id)
        rows = list(DoctorAvailability.objects.filter(doctor_id=doctor_id).values(
            "day_of_week", "start_time", "end_time", "clinic__name"))
        return Response({
            "available": available,
            "doctor_id": doctor_id,
            "debug": {
                "server_local_time" : now_local.strftime("%H:%M:%S"),
                "server_local_day"  : now_local.strftime("%A"),
                "server_weekday_int": now_local.weekday(),
                "server_timezone"   : str(timezone.get_current_timezone()),
                "availability_rows" : rows,
            },
        })

    @staticmethod
    def _is_doctor_available_now(doctor_id):
        now_local = timezone.localtime(timezone.now())
        today     = now_local.weekday()
        cur_time  = now_local.time()
        return DoctorAvailability.objects.filter(
            doctor_id=doctor_id, day_of_week=today,
            start_time__lte=cur_time, end_time__gte=cur_time,
        ).exists()


class DoctorAvailableSlotsView(APIView):
    """
    GET /api/doctor/slots/<doctor_id>/?date=YYYY-MM-DD&clinic=<id>
    Returns list of 30-min time slots (HH:MM) within the doctor's
    availability window for the given date.
    """
    permission_classes = [AllowAny]

    def get(self, request, doctor_id):
        date_str  = request.query_params.get("date")
        clinic_id = request.query_params.get("clinic")

        if not date_str:
            return Response({"error": "date parameter required (YYYY-MM-DD)"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        day_of_week = date_obj.weekday()  # Monday = 0

        avail_qs = DoctorAvailability.objects.filter(
            doctor_id=doctor_id, day_of_week=day_of_week
        )
        if clinic_id:
            avail_qs = avail_qs.filter(clinic_id=clinic_id)

        slots = []
        for avail in avail_qs:
            current = datetime.combine(date_obj, avail.start_time)
            end     = datetime.combine(date_obj, avail.end_time)
            while current < end:
                slots.append(current.strftime("%H:%M"))
                current += timedelta(minutes=30)

        # Deduplicate preserving order (multiple clinics might overlap)
        seen = set()
        unique_slots = []
        for s in slots:
            if s not in seen:
                seen.add(s)
                unique_slots.append(s)

        return Response({"slots": unique_slots, "date": date_str, "doctor_id": doctor_id})


# =============================================================================
# MEETING / APPOINTMENT MANAGEMENT
# =============================================================================

class MeetingBookView(APIView):
    """
    POST /api/book-appointment/
    Works for:
      - Patients booking their own appointment
      - Sales reps booking on behalf of a patient (send patient_id in body)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            clinic_id  = request.data.get("clinic")
            doctor_id  = request.data.get("doctor")
            sales_id   = request.data.get("sales_id")
            patient_id = request.data.get("patient_id")   # sales books for a patient
            appt_type  = request.data.get("appointment_type", "consultation")
            reason     = request.data.get("appointment_reason", "")
            sched_time = request.data.get("scheduled_time")
            duration   = request.data.get("duration", 30)
            department = request.data.get("department", "")
            remark     = request.data.get("remark", "")
            meeting_type = request.data.get("meeting_type", "CONSULT")

            if not clinic_id or not doctor_id or not sched_time:
                return Response({"error": "clinic, doctor, and scheduled_time are required"},
                                status=status.HTTP_400_BAD_REQUEST)

            clinic = get_object_or_404(Clinic, id=clinic_id)
            doctor = get_object_or_404(User, id=doctor_id)

            caller_role = getattr(getattr(request.user, "profile", None), "role", None)

            # Sales can only book consultations
            if caller_role == "sales":
                appt_type = "consultation"

            # Determine patient
            if caller_role == "sales" and patient_id:
                patient    = get_object_or_404(User, id=patient_id, profile__role="patient")
                sales_user = request.user
            else:
                patient    = request.user
                sales_user = None
                if sales_id:
                    try:
                        sales_user = User.objects.get(id=sales_id, profile__role="sales")
                    except User.DoesNotExist:
                        pass

            # Availability check against the scheduled slot
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
                        f"{sched_dt.strftime('%A')} at {sched_dt.strftime('%H:%M')}. "
                        "Please choose another time slot."
                    )
                }, status=status.HTTP_400_BAD_REQUEST)

            # Build participants list
            participants = [
                {"name": doctor.get_full_name() or doctor.username, "email": doctor.email, "role": "doctor"},
                {"name": patient.get_full_name() or patient.username, "email": patient.email, "role": "patient"},
            ]
            if sales_user:
                participants.append({
                    "name": sales_user.get_full_name() or sales_user.username,
                    "email": sales_user.email,
                    "role": "sales",
                })

            meeting = Meeting.objects.create(
                meeting_type=meeting_type,
                appointment_type=appt_type,
                scheduled_time=sched_time,
                duration=duration,
                participants=participants,
                patient=patient,
                doctor=doctor,
                sales=sales_user,
                clinic=clinic,
                appointment_reason=reason,
                department=department,
                remark=remark,
                status="scheduled",
            )

            return Response({
                "meeting_id"    : meeting.meeting_id,
                "room_id"       : meeting.room_id,
                "scheduled_time": str(meeting.scheduled_time),
                "status"        : meeting.status,
            }, status=status.HTTP_201_CREATED)

        except Exception:
            print(traceback.format_exc())
            return Response({"error": "Failed to book appointment"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DoctorAppointmentListView(APIView):
    """GET /api/doctor/appointments/?clinic=<id>"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        clinic_id = request.query_params.get("clinic")
        meetings  = Meeting.objects.filter(doctor=request.user).select_related("patient", "clinic")
        if clinic_id:
            meetings = meetings.filter(clinic_id=clinic_id)
        return Response(MeetingSerializer(meetings.order_by("scheduled_time"), many=True).data)


class PatientAppointmentListView(APIView):
    """GET /api/patient/appointments/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        meetings = Meeting.objects.filter(patient=request.user).select_related("doctor", "clinic")
        return Response(MeetingSerializer(meetings.order_by("scheduled_time"), many=True).data)


class SalesAppointmentListView(APIView):
    """GET /api/meeting/sales/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        meetings = Meeting.objects.filter(sales=request.user).select_related("patient", "doctor", "clinic")
        return Response(MeetingSerializer(meetings.order_by("scheduled_time"), many=True).data)


class MeetingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role      = request.query_params.get("role")
        clinic_id = request.query_params.get("clinic")

        if role == "patient":
            meetings = Meeting.objects.filter(patient=request.user).select_related("doctor", "clinic")
        elif role == "doctor":
            meetings = Meeting.objects.filter(doctor=request.user).select_related("patient", "clinic")
        elif role == "sales":
            meetings = Meeting.objects.filter(sales=request.user).select_related("patient", "doctor", "clinic")
        else:
            meetings = Meeting.objects.filter(patient=request.user).select_related("doctor", "clinic")

        if clinic_id:
            meetings = meetings.filter(clinic_id=clinic_id)
        return Response(MeetingSerializer(meetings.order_by("scheduled_time"), many=True).data)


class MeetingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, meeting_id):
        meeting = get_object_or_404(Meeting, meeting_id=meeting_id)
        return Response(MeetingSerializer(meeting).data)


class MeetingStartView(APIView):
    """
    POST /api/meeting/start/
    
    BUG FIX: The original code checked doctor availability for ALL roles.
    This blocked patients/sales from joining even when the doctor was already
    in the meeting room (meeting status = "started").
    
    New logic:
    - If meeting is already "started" → anyone can join, no availability check
    - If meeting is "scheduled" and caller is doctor → check availability
    - If meeting is "scheduled" and caller is patient/sales → allow (they wait in room)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            meeting_id = request.data.get("meeting_id")
            if not meeting_id:
                return Response({"error": "meeting_id is required"}, status=status.HTTP_400_BAD_REQUEST)

            meeting = get_object_or_404(Meeting, meeting_id=meeting_id)

            if meeting.status == "ended":
                return Response({"error": "This appointment has already ended"}, status=status.HTTP_400_BAD_REQUEST)

            caller_role = "participant"
            if request.user.is_superuser:
                caller_role = "admin"
            elif hasattr(request.user, "profile"):
                caller_role = request.user.profile.role

            # ── KEY FIX ────────────────────────────────────────────────────────
            # If meeting is already started, all participants can join freely.
            # Only enforce availability when the doctor is trying to START it.
            # ──────────────────────────────────────────────────────────────────
            if meeting.status != "started":
                if caller_role == "doctor":
                    # Doctor must be within their scheduled availability window to start
                    if meeting.doctor and not DoctorAvailabilityCheckView._is_doctor_available_now(meeting.doctor_id):
                        now_local = timezone.localtime(timezone.now())
                        rows = list(DoctorAvailability.objects.filter(
                            doctor_id=meeting.doctor_id
                        ).values("day_of_week", "start_time", "end_time"))
                        return Response({
                            "error": (
                                f"You are not available right now according to your schedule. "
                                f"Current local time: {now_local.strftime('%A %H:%M')}. "
                                f"Your saved hours: {rows}. "
                                "Please update your availability or wait until your scheduled time."
                            ),
                            "doctor_available": False,
                        }, status=status.HTTP_400_BAD_REQUEST)

                    # Doctor starts the meeting
                    meeting.status = "started"
                    meeting.save()
                # patients / sales who arrive before doctor: meeting stays "scheduled"
                # but they are allowed into the room to wait

            room_url = f"http://localhost:3000/room/{meeting.room_id}?meeting_id={meeting.meeting_id}"
            return Response({
                "room_id"         : meeting.room_id,
                "meeting_id"      : meeting.meeting_id,
                "room_url"        : room_url,
                "doctor_available": True,
            })

        except Exception:
            print(traceback.format_exc())
            return Response({"error": "Failed to start meeting"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MeetingEndView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
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
            return Response({"error": "Failed to end meeting"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MeetingTranscriptAppendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            meeting_id = request.data.get("meeting_id")
            line       = (request.data.get("line") or "").strip()
            if not meeting_id or not line:
                return Response({"error": "meeting_id and line are required"}, status=status.HTTP_400_BAD_REQUEST)
            meeting = get_object_or_404(Meeting, meeting_id=meeting_id)
            meeting.speech_to_text = (f"{meeting.speech_to_text}\n{line}" if meeting.speech_to_text else line)
            meeting.save()
            return Response({"status": "appended"})
        except Exception:
            print(traceback.format_exc())
            return Response({"error": "Failed to append transcript"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)