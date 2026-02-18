# medical_consultation/urls.py

from django.contrib import admin
from django.urls import path, include
urlpatterns = [
    path("admin/",    admin.site.urls),
    path("api/",      include("consultation.urls")),

]