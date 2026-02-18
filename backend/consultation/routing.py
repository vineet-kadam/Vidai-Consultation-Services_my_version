# consultation/routing.py

from django.urls import re_path
from . import consumers

websocket_urlpatterns = [

    # ── WebRTC signalling — multi-participant mesh ────────────────────────────
    re_path(r"ws/call/(?P<room>[^/]+)/$",   consumers.CallConsumer.as_asgi()),

    # ── STT — Doctor + Patient (1:1 legacy) ──────────────────────────────────
    re_path(r"ws/stt/$",                    consumers.STTConsumer.as_asgi()),

    # ── STT — Unified room (one connection per participant tab) ───────────────
    # Usage: ws/stt/room/?role=doctor&name=Dr+Smith
    re_path(r"ws/stt/room/$",               consumers.STTConsumerRoom.as_asgi()),

    # ── STT — Sales (Agent + Client) ─────────────────────────────────────────
    re_path(r"ws/stt/sales/$",              consumers.STTConsumerSales.as_asgi()),

    # ── STT — Admin (Admin + Participant) ────────────────────────────────────
    re_path(r"ws/stt/admin/$",              consumers.STTConsumerAdmin.as_asgi()),
]