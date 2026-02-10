"""
URL configuration for medical_consultation project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
"""
medical_consultation/urls.py
"""

from django.contrib import admin
from django.urls import path, include
from consultation.views import login_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('consultation.urls')),
    path('api/login/', login_view),
]