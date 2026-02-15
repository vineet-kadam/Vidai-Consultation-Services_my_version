"""
consultation/urls.py
"""

from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path("login/",                              views.login_view),

    # Clinics
    path("clinics/",                            views.get_clinics),
    path("create-clinic/",                      views.create_clinic),

    # Patients
    path("patients/<int:clinic_id>/",           views.get_patients_by_clinic),
    path("create-patient/",                     views.create_patient),

    # Consultation
    path("start-consultation/",                 views.start_consultation),
    path("end-consultation/",                   views.end_consultation),
    path("consultation/<int:consultation_id>/", views.get_consultation),

    # Notes — both always persist to DB
    path("save-notes/",                         views.save_notes),        # full overwrite
    path("append-transcript/",                  views.append_transcript), # single-line append
]