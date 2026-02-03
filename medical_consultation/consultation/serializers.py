"""
consultation/serializers.py
"""

from rest_framework import serializers
from .models import Clinic, Patient, Consultation, Appointment


class SpeechToTextSerializer(serializers.Serializer):
    audio = serializers.FileField()
    appointment_id = serializers.IntegerField()


class ClinicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clinic
        fields = "__all__"


class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = "__all__"


class ConsultationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Consultation
        fields = "__all__"


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = "__all__"