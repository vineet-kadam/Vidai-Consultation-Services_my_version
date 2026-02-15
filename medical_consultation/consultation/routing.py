"""
consultation/routing.py
WebSocket URL patterns
"""

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # WebRTC signalling
    re_path(r"ws/call/(?P<room>[^/]+)/$", consumers.CallConsumer.as_asgi()),

    # Real-time Deepgram STT gateway
    re_path(r"ws/stt/$", consumers.STTConsumer.as_asgi()),
]