# consultation/views.py -- FIXED
# Bug fixes applied:
#   Bug 4a: DoctorAppointmentListView.get — added select_related("sales")
#   Bug 4b: SalesAppointmentListView.get  — added select_related("sales")
#   Without these, MeetingSerializer.get_sales_name() triggers one extra DB
#   query PER ROW (N+1) after the serializer fix lands.
#
# All other logic is unchanged from the original.
from medical_consultation.settings import *
from consultation.services import *
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
from .services import create_patient


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
            "access": str(refresh.access_token), "refresh": str(refresh),
            "role": role, "is_superuser": user.is_superuser,
            "is_staff": user.is_staff, "username": user.username,
            "full_name": user.get_full_name(), "user_id": user.id,
        })


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


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
        return Response({"id": user.id, "username": user.username,
                         "full_name": user.get_full_name(), "role": role},
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
    permission_classes = [AllowAny]

    def get(self, request, doctor_id):
        availability = DoctorAvailability.objects.filter(doctor_id=doctor_id, clinic__isnull=False)
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
    permission_classes = [AllowAny]

    def get(self, request, doctor_id):
        now_local = timezone.localtime(timezone.now())
        available = self._is_doctor_available_now(doctor_id)
        rows = list(DoctorAvailability.objects.filter(
            doctor_id=doctor_id, clinic__isnull=False
        ).values("day_of_week", "start_time", "end_time", "clinic__name"))
        return Response({
            "available": available, "doctor_id": doctor_id,
            "debug": {
                "server_local_time": now_local.strftime("%H:%M:%S"),
                "server_local_day": now_local.strftime("%A"),
                "server_weekday_int": now_local.weekday(),
                "server_timezone": str(timezone.get_current_timezone()),
                "availability_rows": rows,
            },
        })

    @staticmethod
    def _is_doctor_available_now(doctor_id):
        now_local = timezone.localtime(timezone.now())
        today     = now_local.weekday()
        cur_time  = now_local.time()
        return DoctorAvailability.objects.filter(
            doctor_id=doctor_id, clinic__isnull=False,
            day_of_week=today, start_time__lte=cur_time, end_time__gte=cur_time,
        ).exists()


class DoctorAvailableSlotsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, doctor_id):
        date_str  = request.query_params.get("date")
        clinic_id = request.query_params.get("clinic")

        if not date_str:
            return Response({"error": "date parameter required (YYYY-MM-DD)"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format."}, status=status.HTTP_400_BAD_REQUEST)

        day_of_week = date_obj.weekday()
        avail_qs = DoctorAvailability.objects.filter(
            doctor_id=doctor_id, clinic__isnull=False, day_of_week=day_of_week,
        )
        if clinic_id:
            avail_qs = avail_qs.filter(clinic_id=clinic_id)

        seen = set()
        slots = []
        for avail in avail_qs:
            current = datetime.combine(date_obj, avail.start_time)
            end     = datetime.combine(date_obj, avail.end_time)
            while current < end:
                s = current.strftime("%H:%M")
                if s not in seen:
                    seen.add(s)
                    slots.append(s)
                current += timedelta(minutes=15)

        return Response({"slots": slots, "date": date_str, "doctor_id": doctor_id})


# =============================================================================
# SALES AVAILABILITY
# =============================================================================

class SalesAvailabilityView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, sales_id):
        availability = DoctorAvailability.objects.filter(
            doctor_id=sales_id, clinic__isnull=True
        )
        return Response(DoctorAvailabilitySerializer(availability, many=True).data)

    def post(self, request):
        if not request.user.is_authenticated:
            return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
        role = getattr(getattr(request.user, "profile", None), "role", None)
        if role != "sales":
            return Response({"error": "Sales representatives only"}, status=status.HTTP_403_FORBIDDEN)

        day        = request.data.get("day_of_week")
        start_time = request.data.get("start_time")
        end_time   = request.data.get("end_time")

        if day is None or not start_time or not end_time:
            return Response({"error": "day_of_week, start_time, end_time are required"},
                            status=status.HTTP_400_BAD_REQUEST)

        day = int(day)

        existing = DoctorAvailability.objects.filter(
            doctor=request.user,
            clinic__isnull=True,
            day_of_week=day,
        ).first()

        if existing:
            existing.start_time = start_time
            existing.end_time   = end_time
            existing.save()
            return Response(DoctorAvailabilitySerializer(existing).data, status=status.HTTP_200_OK)
        else:
            avail = DoctorAvailability.objects.create(
                doctor=request.user,
                clinic=None,
                day_of_week=day,
                start_time=start_time,
                end_time=end_time,
            )
            return Response(DoctorAvailabilitySerializer(avail).data, status=status.HTTP_201_CREATED)


class SalesAvailableSlotsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, sales_id):
        date_str = request.query_params.get("date")
        if not date_str:
            return Response({"error": "date parameter required (YYYY-MM-DD)"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format."}, status=status.HTTP_400_BAD_REQUEST)

        day_of_week = date_obj.weekday()
        avail_qs = DoctorAvailability.objects.filter(
            doctor_id=sales_id,
            clinic__isnull=True,
            day_of_week=day_of_week,
        )

        seen = set()
        slots = []
        for avail in avail_qs:
            current = datetime.combine(date_obj, avail.start_time)
            end     = datetime.combine(date_obj, avail.end_time)
            while current < end:
                s = current.strftime("%H:%M")
                if s not in seen:
                    seen.add(s)
                    slots.append(s)
                current += timedelta(minutes=15)

        return Response({"slots": slots, "date": date_str, "sales_id": sales_id})


# =============================================================================
# DOUBLE-BOOKING GUARD
# =============================================================================

def _check_double_booking(target_user, sched_time_str, field="doctor"):
    qs = Meeting.objects.filter(
        scheduled_time=sched_time_str,
        status__in=["scheduled", "started"],
    )
    if field == "doctor":
        qs = qs.filter(doctor=target_user)
    else:
        qs = qs.filter(sales=target_user)
    return qs.exists()


# =============================================================================
# MEETING MANAGEMENT
# =============================================================================

class MeetingBookView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request ):
        try:

            """{'patient': {'username': 'CFC1-200', 'password': 'CFC1-200', 'first_name': 'Aaditya', 'last_name': 'Kharde'}, 'doctor': {'username': 'amelia_scott'}, 
            'appointment': {'appointment_date': '2026-02-23', 'start_datetime': '2026-02-23T18:10:00+00:00', 'end_datetime': '2026-02-23T18:29:00+00:00',
              'schedule_time': '0:19:00', 'clinic_name': 'Centro Fertility Center 1', 'reason': 'Fertility Consultation', 'remark': 'N/A'}}"""
            
            appt_type    = request.data.get("appointment_type", "consultation")
            is_sales_mtg = (appt_type == "sales_meeting")
            
            # Get clinic by name or direct clinic ID
            clinic_name_or_id = request.data.get("clinic")
            if not clinic_name_or_id and request.data.get("appointment"):
                clinic_name_or_id = request.data.get("appointment").get("clinic_name")
            
            # Lookup clinic by name or ID
            clinic_id = None
            if clinic_name_or_id:
                try:
                    clinic = Clinic.objects.get(name=clinic_name_or_id)
                    clinic_id = clinic.id
                except Clinic.DoesNotExist:
                    try:
                        clinic = Clinic.objects.get(id=clinic_name_or_id)
                        clinic_id = clinic.id
                    except Clinic.DoesNotExist:
                        clinic_id = None
            
            doctor_id    = User.objects.filter(username=request.data.get("doctor")['username']).first().id if request.data.get("doctor") else None
            sales_id     = request.data.get("sales_id")
            patient_id   = create_patient(request.data.get("patient")).id if request.data.get("patient") else None
            reason       = request.data.get("appointment", {}).get('reason', "")
            # Use start_datetime if available, otherwise fall back to schedule_time
            sched_time   = request.data.get("appointment", {}).get('start_datetime') or request.data.get("appointment", {}).get('schedule_time')
            duration     = request.data.get("appointment", {}).get("duration", 30)
            department   = request.data.get("department", "")
            remark       = request.data.get("appointment", {}).get("remark", "")
            meeting_type = request.data.get("meeting_type", "SALES_MEETING" if is_sales_mtg else "CONSULT")

            if not sched_time:
                return Response({"error": "scheduled_time is required"}, status=status.HTTP_400_BAD_REQUEST)

            caller_role = getattr(getattr(request.user, "profile", None), "role", None)

            if caller_role == "sales":
                sales_user = request.user
                if not patient_id:
                    return Response({"error": "patient_id is required when booking as sales"},
                                    status=status.HTTP_400_BAD_REQUEST)
                patient = get_object_or_404(User, id=patient_id, profile__role="patient")
            else:
                patient    = request.user
                sales_user = None
                if sales_id:
                    try:
                        sales_user = User.objects.get(id=sales_id, profile__role="sales")
                    except User.DoesNotExist:
                        pass

            # ── SALES MEETING ─────────────────────────────────────────────
            if is_sales_mtg:
                if not sales_user:
                    return Response({"error": "A sales representative is required for a sales meeting."},
                                    status=status.HTTP_400_BAD_REQUEST)

                sched_dt    = datetime.fromisoformat(sched_time)
                day_of_week = sched_dt.weekday()
                slot_time   = sched_dt.time()

                slot_ok = DoctorAvailability.objects.filter(
                    doctor=sales_user,
                    clinic__isnull=True,
                    day_of_week=day_of_week,
                    start_time__lte=slot_time,
                    end_time__gte=slot_time,
                ).exists()

                if not slot_ok:
                    return Response({
                        "error": (
                            f"{sales_user.get_full_name()} is not available on "
                            f"{sched_dt.strftime('%A')} at {sched_dt.strftime('%H:%M')}."
                        )
                    }, status=status.HTTP_400_BAD_REQUEST)

                if _check_double_booking(sales_user, sched_time, field="sales"):
                    return Response({
                        "error": f"{sales_user.get_full_name()} already has a meeting at this time."
                    }, status=status.HTTP_400_BAD_REQUEST)

                participants = [
                    {"name": patient.get_full_name() or patient.username,       "email": patient.email,    "role": "patient"},
                    {"name": sales_user.get_full_name() or sales_user.username, "email": sales_user.email, "role": "sales"},
                ]
                meeting = Meeting.objects.create(
                    meeting_type=meeting_type, appointment_type=appt_type,
                    scheduled_time=sched_time, duration=duration,
                    participants=participants, patient=patient,
                    doctor=None, sales=sales_user, clinic=None,
                    appointment_reason=reason, department=department,
                    remark=remark, status="scheduled",
                )
                return Response({
                    "meeting_id": meeting.meeting_id, "room_id": meeting.room_id,
                    "scheduled_time": str(meeting.scheduled_time), "status": meeting.status,
                }, status=status.HTTP_201_CREATED)

            # ── CONSULTATION ──────────────────────────────────────────────
            if not clinic_id or not doctor_id:
                return Response({"error": "clinic and doctor are required for consultations"},
                                status=status.HTTP_400_BAD_REQUEST)

            clinic = get_object_or_404(Clinic, id=clinic_id)
            doctor = get_object_or_404(User, id=doctor_id)

            if caller_role == "sales":
                appt_type = "consultation"

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
                }, status=status.HTTP_400_BAD_REQUEST)

            if _check_double_booking(doctor, sched_time, field="doctor"):
                return Response({
                    "error": f"Dr. {doctor.get_full_name()} already has an appointment at this time."
                }, status=status.HTTP_400_BAD_REQUEST)

            participants = [
                {"name": doctor.get_full_name() or doctor.username,   "email": doctor.email,   "role": "doctor"},
                {"name": patient.get_full_name() or patient.username, "email": patient.email,  "role": "patient"},
            ]
            if sales_user:
                participants.append({
                    "name": sales_user.get_full_name() or sales_user.username,
                    "email": sales_user.email, "role": "sales",
                })

            meeting = Meeting.objects.create(
                meeting_type=meeting_type, appointment_type=appt_type,
                scheduled_time=sched_time, duration=duration,
                participants=participants, patient=patient,
                doctor=doctor, sales=sales_user, clinic=clinic,
                appointment_reason=reason, department=department,
                remark=remark, status="scheduled",
            )
            return Response({
                "meeting_id": meeting.meeting_id, "room_id": meeting.room_id,
                "scheduled_time": str(meeting.scheduled_time), "status": meeting.status,
            }, status=status.HTTP_201_CREATED)

        except Exception:
            print(traceback.format_exc())
            return Response({"error": "Failed to book appointment"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DoctorAppointmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        clinic_id = request.query_params.get("clinic")
        # FIX Bug 4a: added select_related("sales") — prevents N+1 after serializer fix
        meetings = Meeting.objects.filter(doctor=request.user).select_related("patient", "clinic", "sales")
        if clinic_id:
            meetings = meetings.filter(clinic_id=clinic_id)
        return Response(MeetingSerializer(meetings.order_by("scheduled_time"), many=True).data)


class PatientAppointmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # select_related("sales") was already present here — no change needed
        meetings = Meeting.objects.filter(patient=request.user).select_related("doctor", "clinic", "sales")
        return Response(MeetingSerializer(meetings.order_by("scheduled_time"), many=True).data)


class SalesAppointmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # FIX Bug 4b: added select_related("sales") — prevents N+1 after serializer fix
        meetings = Meeting.objects.filter(sales=request.user).select_related("patient", "doctor", "clinic", "sales")
        return Response(MeetingSerializer(meetings.order_by("scheduled_time"), many=True).data)


class MeetingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role      = request.query_params.get("role")
        clinic_id = request.query_params.get("clinic")

        if role == "patient":
            meetings = Meeting.objects.filter(patient=request.user).select_related("doctor", "clinic", "sales")
        elif role == "doctor":
            meetings = Meeting.objects.filter(doctor=request.user).select_related("patient", "clinic", "sales")
        elif role == "sales":
            meetings = Meeting.objects.filter(sales=request.user).select_related("patient", "doctor", "clinic", "sales")
        else:
            meetings = Meeting.objects.filter(patient=request.user).select_related("doctor", "clinic", "sales")

        if clinic_id:
            meetings = meetings.filter(clinic_id=clinic_id)
        return Response(MeetingSerializer(meetings.order_by("scheduled_time"), many=True).data)


class MeetingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, meeting_id):
        meeting = get_object_or_404(Meeting, meeting_id=meeting_id)
        return Response(MeetingSerializer(meeting).data)


class MeetingStartView(APIView):
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

            if meeting.status != "started":
                is_sales_meeting = (meeting.appointment_type == "sales_meeting" or meeting.doctor_id is None)

                if caller_role == "doctor" and not is_sales_meeting:
                    if meeting.doctor and not DoctorAvailabilityCheckView._is_doctor_available_now(meeting.doctor_id):
                        now_local = timezone.localtime(timezone.now())
                        rows = list(DoctorAvailability.objects.filter(
                            doctor_id=meeting.doctor_id, clinic__isnull=False,
                        ).values("day_of_week", "start_time", "end_time"))
                        return Response({
                            "error": (
                                f"You are not available right now. "
                                f"Local time: {now_local.strftime('%A %H:%M')}. "
                                f"Your hours: {rows}."
                            ),
                            "doctor_available": False,
                        }, status=status.HTTP_400_BAD_REQUEST)
                    meeting.status = "started"
                    meeting.save()

                elif caller_role == "sales" and is_sales_meeting:
                    meeting.status = "started"
                    meeting.save()

                elif caller_role == "sales" and not is_sales_meeting:
                    meeting.status = "started"
                    meeting.save()

                elif caller_role == "patient":
                    meeting.status = "started"
                    meeting.save()

                elif caller_role == "admin":
                    meeting.status = "started"
                    meeting.save()

            room_url = f"http://{API}/room/{meeting.room_id}?meeting_id={meeting.meeting_id}"
            return Response({
                "room_id": meeting.room_id, "meeting_id": meeting.meeting_id,
                "room_url": room_url, "doctor_available": True,
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


class SocketStatusView(APIView):
    """
    API endpoint to get WebSocket status information.
    Provides non-blocking, read-only access to socket connectivity data.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        """Get current WebSocket status information."""
        try:
            info = SocketStatusService.get_socket_info_summary()
            return Response(info, status=status.HTTP_200_OK)
        except Exception as e:
            print(f"[SocketStatusView] Error: {traceback.format_exc()}")
            return Response(
                {"error": "Failed to retrieve socket status"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def get_all_sockets(self, request):
        """Get detailed information about all active sockets."""
        try:
            sockets = SocketStatusService.get_all_sockets()
            return Response({
                "total": len(sockets),
                "sockets": sockets,
                "timestamp": datetime.now().isoformat()
            }, status=status.HTTP_200_OK)
        except Exception as e:
            print(f"[SocketStatusView] Error: {traceback.format_exc()}")
            return Response(
                {"error": "Failed to retrieve all sockets"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )