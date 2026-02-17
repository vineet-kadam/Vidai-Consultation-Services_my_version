# medical_consultation/urls.py

from django.contrib import admin
from django.urls import path, include
from consultation.views import login_view

urlpatterns = [
    path("admin/",    admin.site.urls),
    path("api/",      include("consultation.urls")),
    # /api/login/ is also available directly (backward compat)
    path("api/login/", login_view),
]