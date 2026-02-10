"""
consultation/urls.py
"""

from django.urls import path
from .views import *

urlpatterns = [
    path("speech-to-text/", speech_to_text),
    path("clinics/", get_clinics),
    path("create-clinic/", create_clinic),
    path("create-patient/", create_patient),
    path("patients/<int:clinic_id>/", get_patients_by_clinic),
    path("start-consultation/", start_consultation),
    path("end-consultation/", end_consultation),
    path("consultation/<int:consultation_id>/", get_consultation),
    path("save-notes/", save_notes),
]