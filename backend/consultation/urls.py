# consultation/urls.py -- UPDATED
# Added: /doctor/slots/<doctor_id>/ for availability slot picker

from django.urls import path
from .views import (
    LoginView,
    ProfileView,
    UserCreateView,
    PatientListView,
    SalesListView,
    ClinicListCreateView,
    DoctorListView,
    DoctorAvailabilityView,
    DoctorAvailabilityCheckView,
    DoctorAvailableSlotsView,        # NEW
    MeetingBookView,
    DoctorAppointmentListView,
    PatientAppointmentListView,
    SalesAppointmentListView,
    MeetingListView,
    MeetingDetailView,
    MeetingStartView,
    MeetingEndView,
    MeetingTranscriptAppendView,
)

urlpatterns = [
    # Auth
    path("login/",   LoginView.as_view(),   name="login"),
    path("profile/", ProfileView.as_view(), name="profile"),

    # User management
    path("users/create/",   UserCreateView.as_view(),  name="user-create"),
    path("users/patients/", PatientListView.as_view(), name="patient-list"),
    path("users/sales/",    SalesListView.as_view(),   name="sales-list"),

    # Clinics
    path("clinics/", ClinicListCreateView.as_view(), name="clinics"),

    # Doctors
    path("doctors/",                         DoctorListView.as_view(),              name="doctor-list"),
    path("doctor/availability/<int:doctor_id>/", DoctorAvailabilityView.as_view(),  name="doctor-availability"),
    path("doctor/set-availability/",         DoctorAvailabilityView.as_view(),      name="doctor-set-availability"),
    path("doctor/available/<int:doctor_id>/",    DoctorAvailabilityCheckView.as_view(), name="doctor-available"),
    path("doctor/slots/<int:doctor_id>/",    DoctorAvailableSlotsView.as_view(),    name="doctor-slots"),   # NEW

    # Appointments / meetings
    path("book-appointment/",        MeetingBookView.as_view(),              name="book-appointment"),
    path("doctor/appointments/",     DoctorAppointmentListView.as_view(),    name="doctor-appointments"),
    path("patient/appointments/",    PatientAppointmentListView.as_view(),   name="patient-appointments"),
    path("meeting/sales/",           SalesAppointmentListView.as_view(),     name="sales-appointments"),
    path("meetings/",                MeetingListView.as_view(),              name="meeting-list"),
    path("meeting/<int:meeting_id>/",MeetingDetailView.as_view(),            name="meeting-detail"),
    path("meeting/start/",           MeetingStartView.as_view(),             name="meeting-start"),
    path("meeting/end/",             MeetingEndView.as_view(),               name="meeting-end"),
    path("append-transcript/",       MeetingTranscriptAppendView.as_view(),  name="append-transcript"),
]