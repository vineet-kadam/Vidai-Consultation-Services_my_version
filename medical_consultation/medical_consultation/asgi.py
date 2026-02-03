"""
medical_consultation/asgi.py
"""

import os
import django
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from channels.auth import AuthMiddlewareStack
import consultation.routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medical_consultation.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(
            consultation.routing.websocket_urlpatterns
        )
    ),
})