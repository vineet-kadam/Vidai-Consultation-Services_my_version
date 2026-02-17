# consultation/urls.py
#
# This file maps URL paths to view functions.
# All URLs here are prefixed with /api/ (set in medical_consultation/urls.py)
# So "login/" here becomes "/api/login/" in the browser.

from django.urls import path
from . import views

urlpatterns = [

    # ── Auth ──────────────────────────────────────────────────────────────────
    path("login/",                              views.login_view),
    path("profile/",                            views.get_profile),

    # ── Admin — user management ───────────────────────────────────────────────
    path("create-user/",                        views.create_user),         # create doctor or patient
    path("create-clinic/",                      views.create_clinic),

    # ── Clinics (public) ─────────────────────────────────────────────────────
    path("clinics/",                            views.get_clinics),

    # ── Doctors ──────────────────────────────────────────────────────────────
    path("doctors/",                            views.get_doctors),                     # list doctors
    path("doctor/availability/<int:doctor_id>/",views.get_doctor_availability),         # get hours
    path("doctor/set-availability/",            views.set_doctor_availability),         # set hours
    path("doctor/available/<int:doctor_id>/",   views.check_doctor_available),          # is online now?
    path("doctor/appointments/",               views.get_doctor_appointments),          # doctor's calendar

    # ── Patients ─────────────────────────────────────────────────────────────
    path("list-patients/",                      views.list_patients),                   # all patients
    path("patients/<int:clinic_id>/",           views.get_patients_by_clinic),          # legacy

    # ── Appointments / Meetings ───────────────────────────────────────────────
    path("book-appointment/",                   views.book_appointment),                # patient books
    path("patient/appointments/",              views.get_patient_appointments),         # patient's calendar
    path("meeting/<int:meeting_id>/",           views.get_meeting),                     # single meeting
    path("meeting/start/",                      views.start_meeting),                   # start call
    path("meeting/end/",                        views.end_meeting),                     # end call
    path("append-transcript/",                  views.append_transcript),               # STT line append
]