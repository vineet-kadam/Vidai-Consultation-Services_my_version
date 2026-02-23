from .models import *


def create_doctor(doctor_data):
    username = doctor_data["first_name"].lower().strip() + "_" + doctor_data["last_name"].lower().strip()
    doctor_available  = User.objects.filter(username=username).exists()
    if doctor_available:
        return "Doctor already exists"
    doctor_user = create_user({
        "username"   : username,
        "password"   : username,
        "first_name": doctor_data["first_name"],
        "last_name" : doctor_data["last_name"],
        "role"      : "doctor",
    })
    return doctor_user

def create_patient(patient_data):
    username = patient_data["username"]
    patient_available  = User.objects.filter(username=username).exists()
    if patient_available:
        return "Patient already exists"
    patient_user = create_user({
        "username"   : username,
        "password"   : username,
        "first_name": patient_data["first_name"],
        "last_name" : patient_data["last_name"],
        "role"      : "patient",
    })
    return patient_user

def create_user(user_data):
    user = User.objects.create_user(
        username=user_data["username"],
        password=user_data["password"],
        first_name=user_data["first_name"],
        last_name=user_data["last_name"],
    )
    
    # Create the associated UserProfile with the role
    role = user_data.get("role", "patient").lower()
    UserProfile.objects.create(user=user, role=role)
    
    return user

