"""
consultation/consumers.py

Consumers:
  1. CallConsumer       – Multi-participant WebRTC signalling + in-room chat
  2. _BaseSTTConsumer   – Shared STT base class
  3. STTConsumer        – Doctor + Patient   →  ws/stt/
  4. STTConsumerSales   – Agent  + Client    →  ws/stt/sales/
  5. STTConsumerAdmin   – Admin  + Participant → ws/stt/admin/
  6. STTConsumerRoom    – Single speaker per tab → ws/stt/room/?role=&name=
"""

import asyncio
import datetime
import json
import os
import uuid

import websockets
from channels.generic.websocket import AsyncWebsocketConsumer

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "241891d132965abc6b1488661f56229bc0d70f47")

try:
    _WS_MAJOR = int(websockets.__version__.split(".")[0])
except Exception:
    _WS_MAJOR = 10

_HEADERS_KWARG = "additional_headers" if _WS_MAJOR >= 14 else "extra_headers"
print(f"ℹ️  websockets {websockets.__version__}  →  header kwarg = '{_HEADERS_KWARG}'")

DEEPGRAM_URI = (
    "wss://api.deepgram.com/v1/listen"
    "?model=nova-2-medical"
    "&punctuate=true"
    "&interim_results=true"
    "&encoding=linear16"
    "&sample_rate=16000"
    "&channels=1"
    "&smart_format=true"
    "&endpointing=800"
)

DOCTOR_PREFIX  = 0x01
PATIENT_PREFIX = 0x02
KEEPALIVE_MSG  = json.dumps({"type": "KeepAlive"})

# In-memory room registry — lives as long as the server process.
# { room_name: { peer_id: { "name", "role", "channel" } } }
_room_peers: dict = {}


# =============================================================================
# 1. CallConsumer — Multi-participant WebRTC signalling + in-room chat
# =============================================================================

class CallConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.room_name       = self.scope["url_route"]["kwargs"]["room"]
        self.room_group_name = f"call_{self.room_name}"
        self.peer_id         = str(uuid.uuid4())[:8]
        self.peer_name       = "Participant"
        self.peer_role       = "participant"

        if self.room_name not in _room_peers:
            _room_peers[self.room_name] = {}

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        print(f"✅ [Call] peer={self.peer_id} connected  room={self.room_name}")

    async def disconnect(self, close_code):
        room = _room_peers.get(self.room_name, {})
        room.pop(self.peer_id, None)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type"   : "relay_message",
                "payload": {"type": "peer_left", "id": self.peer_id},
                "exclude": self.channel_name,
            },
        )
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        print(f"❌ [Call] peer={self.peer_id} left  room={self.room_name}  code={close_code}")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except Exception:
            return

        msg_type = data.get("type")

        # ── JOIN ──────────────────────────────────────────────────────────────
        if msg_type == "join":
            self.peer_name = data.get("name", "Participant")
            self.peer_role = data.get("role", "participant")

            room = _room_peers.setdefault(self.room_name, {})

            existing_peers = [
                {"id": pid, "name": info["name"], "role": info["role"]}
                for pid, info in room.items()
            ]

            room[self.peer_id] = {
                "name"   : self.peer_name,
                "role"   : self.peer_role,
                "channel": self.channel_name,
            }

            await self.send(json.dumps({
                "type" : "assigned",
                "id"   : self.peer_id,
                "peers": existing_peers,
            }))

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type"   : "relay_message",
                    "payload": {
                        "type": "peer_joined",
                        "id"  : self.peer_id,
                        "name": self.peer_name,
                        "role": self.peer_role,
                    },
                    "exclude": self.channel_name,
                },
            )
            print(
                f"📋 [Call] {self.peer_name} ({self.peer_role}) joined — "
                f"room={self.room_name}  peers={len(room)}"
            )
            return

        # ── OFFER / ANSWER / ICE → route to specific peer ─────────────────────
        if msg_type in ("offer", "answer", "ice"):
            to_id  = data.get("to")
            room   = _room_peers.get(self.room_name, {})
            target = room.get(to_id)
            if not target:
                return

            fwd = dict(data)
            fwd["from"] = self.peer_id
            fwd.pop("to", None)

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type"          : "relay_to_channel",
                    "payload"       : fwd,
                    "target_channel": target["channel"],
                },
            )
            return

        # ── CHAT → broadcast to all ────────────────────────────────────────────
        if msg_type == "chat":
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type"   : "relay_message",
                    "payload": {
                        "type": "chat",
                        "from": self.peer_id,
                        "name": self.peer_name,
                        "role": self.peer_role,
                        "text": str(data.get("text", ""))[:500],
                        "ts"  : datetime.datetime.utcnow().isoformat() + "Z",
                    },
                    "exclude": None,
                },
            )
            return

    async def relay_message(self, event):
        if event.get("exclude") and self.channel_name == event["exclude"]:
            return
        await self.send(text_data=json.dumps(event["payload"]))

    async def relay_to_channel(self, event):
        if self.channel_name != event["target_channel"]:
            return
        await self.send(text_data=json.dumps(event["payload"]))


# =============================================================================
# 2. _BaseSTTConsumer — shared machinery for all two-speaker STT consumers
# =============================================================================

class _BaseSTTConsumer(AsyncWebsocketConsumer):
    LABEL_A = "Speaker1"
    LABEL_B = "Speaker2"
    LOG_TAG  = "STT"

    async def connect(self):
        await self.accept()
        print(f"✅ [{self.LOG_TAG}] client accepted")

        self.dg_a     = None
        self.dg_b     = None
        self.buf_a    = []
        self.buf_b    = []
        self.dg_ready = False
        self._tasks   = []
        self._closing = False

        self._tasks.append(asyncio.ensure_future(self._init_deepgram()))

    async def disconnect(self, close_code):
        print(f"❌ [{self.LOG_TAG}] disconnected  code={close_code}")
        self._closing = True

        for t in self._tasks:
            if not t.done():
                t.cancel()
                try:    await t
                except asyncio.CancelledError: pass

        for ws in (self.dg_a, self.dg_b):
            if ws:
                try:    await ws.close()
                except Exception: pass

    async def receive(self, text_data=None, bytes_data=None):
        if not bytes_data or len(bytes_data) < 2:
            return

        prefix = bytes_data[0]
        audio  = bytes_data[1:]

        if prefix == 0x01:
            if self.dg_ready and self.dg_a:
                try:    await self.dg_a.send(audio)
                except Exception: pass
            elif len(self.buf_a) < 120:
                self.buf_a.append(audio)

        elif prefix == 0x02:
            if self.dg_ready and self.dg_b:
                try:    await self.dg_b.send(audio)
                except Exception: pass
            elif len(self.buf_b) < 120:
                self.buf_b.append(audio)

    async def _open_deepgram(self):
        auth = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        try:
            for kwarg in (_HEADERS_KWARG, "additional_headers", "extra_headers"):
                try:
                    ws = await asyncio.wait_for(
                        websockets.connect(
                            DEEPGRAM_URI,
                            **{kwarg: auth},
                            ping_interval=None,
                            close_timeout=2,
                        ),
                        timeout=15.0,
                    )
                    return ws
                except TypeError:
                    continue
                except asyncio.TimeoutError:
                    raise TimeoutError(
                        f"Deepgram connection timed out after 15 s (kwarg={kwarg})"
                    )
                except Exception as exc:
                    raise exc
            raise RuntimeError("No compatible websockets header kwarg found")
        except Exception as e:
            print(f"❌ [{self.LOG_TAG}] Deepgram connection failed: {e}")
            raise

    async def _keepalive_loop(self, label):
        while not self._closing:
            await asyncio.sleep(5)
            ws = self.dg_a if label == self.LABEL_A else self.dg_b
            if ws is None:
                continue
            try:
                await ws.send(KEEPALIVE_MSG)
            except Exception:
                pass

    async def _init_deepgram(self):
        try:
            print(f"🔌 [{self.LOG_TAG}] Connecting to Deepgram (2 connections)…")

            try:
                self.dg_a = await asyncio.wait_for(
                    self._open_deepgram(), timeout=20.0
                )
                print(f"✅ [{self.LOG_TAG}] {self.LABEL_A} connection established")
            except asyncio.TimeoutError:
                await self.send(json.dumps({
                    "type"   : "stt_error",
                    "message": (
                        f"Deepgram {self.LABEL_A.lower()} connection timed out. "
                        "Check your API key and internet connection."
                    ),
                }))
                return
            except Exception as e:
                await self.send(json.dumps({
                    "type"   : "stt_error",
                    "message": f"Deepgram {self.LABEL_A.lower()} connection failed: {str(e)}",
                }))
                return

            try:
                self.dg_b = await asyncio.wait_for(
                    self._open_deepgram(), timeout=20.0
                )
                print(f"✅ [{self.LOG_TAG}] {self.LABEL_B} connection established")
            except asyncio.TimeoutError:
                await self.send(json.dumps({
                    "type"   : "stt_error",
                    "message": (
                        f"Deepgram {self.LABEL_B.lower()} connection timed out. "
                        "Check your API key and internet connection."
                    ),
                }))
                return
            except Exception as e:
                await self.send(json.dumps({
                    "type"   : "stt_error",
                    "message": f"Deepgram {self.LABEL_B.lower()} connection failed: {str(e)}",
                }))
                return

            self.dg_ready = True
            print(f"✅ [{self.LOG_TAG}] Both Deepgram connections open")

            for chunk in self.buf_a:
                try:    await self.dg_a.send(chunk)
                except Exception: break
            self.buf_a.clear()

            for chunk in self.buf_b:
                try:    await self.dg_b.send(chunk)
                except Exception: break
            self.buf_b.clear()

            await self.send(json.dumps({"type": "stt_ready"}))

            self._tasks.append(asyncio.ensure_future(self._keepalive_loop(self.LABEL_A)))
            self._tasks.append(asyncio.ensure_future(self._keepalive_loop(self.LABEL_B)))

            await asyncio.gather(
                self._relay_loop(self.LABEL_A),
                self._relay_loop(self.LABEL_B),
            )

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            print(f"❌ [{self.LOG_TAG}] init error: {exc}")
            try:
                await self.send(json.dumps({"type": "stt_error", "message": str(exc)}))
            except Exception:
                pass

    async def _relay_loop(self, label):
        while not self._closing:
            ws = self.dg_a if label == self.LABEL_A else self.dg_b
            if ws is None:
                await asyncio.sleep(0.5)
                continue

            try:
                async for raw in ws:
                    if self._closing:
                        break
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if data.get("type") != "Results":
                        continue
                    alts = data.get("channel", {}).get("alternatives", [])
                    if not alts:
                        continue
                    text     = alts[0].get("transcript", "").strip()
                    is_final = data.get("is_final", False)
                    if text:
                        await self.send(json.dumps({
                            "type"    : "transcript",
                            "text"    : text,
                            "is_final": is_final,
                            "speaker" : label,
                        }))
                        print(
                            f"📝 [{self.LOG_TAG}] [{label}] "
                            f"{'FINAL' if is_final else 'interim'}: {text[:70]}"
                        )

                if self._closing:
                    break
                raise ConnectionResetError("stream closed")

            except asyncio.CancelledError:
                return

            except Exception as exc:
                if self._closing:
                    break
                print(
                    f"⚠️  [{self.LOG_TAG}] [{label}] "
                    f"dropped ({str(exc)[:60]}) — reconnecting in 1 s…"
                )
                await asyncio.sleep(1)
                try:
                    new_ws = await asyncio.wait_for(
                        self._open_deepgram(), timeout=20.0
                    )
                    if label == self.LABEL_A:
                        self.dg_a = new_ws
                    else:
                        self.dg_b = new_ws
                    print(f"✅ [{self.LOG_TAG}] [{label}] reconnected")
                except asyncio.TimeoutError:
                    print(f"❌ [{self.LOG_TAG}] [{label}] reconnect timeout — retrying in 3 s")
                    await asyncio.sleep(3)
                except Exception as re_err:
                    print(
                        f"❌ [{self.LOG_TAG}] [{label}] "
                        f"reconnect failed: {re_err} — retrying in 3 s"
                    )
                    await asyncio.sleep(3)


# =============================================================================
# 3–5. Concrete two-speaker STT consumers
# =============================================================================

class STTConsumer(_BaseSTTConsumer):
    """Doctor + Patient  →  ws/stt/"""
    LABEL_A = "Doctor"
    LABEL_B = "Patient"
    LOG_TAG  = "STT"

class STTConsumerSales(_BaseSTTConsumer):
    """Agent + Client  →  ws/stt/sales/"""
    LABEL_A = "Agent"
    LABEL_B = "Client"
    LOG_TAG  = "STT-Sales"

class STTConsumerAdmin(_BaseSTTConsumer):
    """Admin + Participant  →  ws/stt/admin/"""
    LABEL_A = "Admin"
    LABEL_B = "Participant"
    LOG_TAG  = "STT-Admin"


# =============================================================================
# 6. STTConsumerRoom — one Deepgram connection per participant tab
#    Used by MeetingRoom.js (multi-participant room component)
#    URL: ws/stt/room/?role=doctor&name=Dr+Smith
# =============================================================================

class STTConsumerRoom(AsyncWebsocketConsumer):

    async def connect(self):
        qs_raw = self.scope.get("query_string", b"").decode()
        qs     = {}
        for part in qs_raw.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                qs[k] = v.replace("+", " ").replace("%20", " ")

        role       = qs.get("role", "participant").strip()
        name       = qs.get("name", "").strip()
        self.label = f"{role.capitalize()} ({name})" if name else role.capitalize()
        self.log   = f"STT-Room[{role}]"

        await self.accept()
        print(f"✅ [{self.log}] client accepted — speaker: {self.label}")

        self.dg       = None
        self.buf      = []
        self.dg_ready = False
        self._tasks   = []
        self._closing = False

        self._tasks.append(asyncio.ensure_future(self._init()))

    async def disconnect(self, close_code):
        print(f"❌ [{self.log}] disconnected  code={close_code}")
        self._closing = True

        for t in self._tasks:
            if not t.done():
                t.cancel()
                try:    await t
                except asyncio.CancelledError: pass

        if self.dg:
            try:    await self.dg.close()
            except Exception: pass

    async def receive(self, text_data=None, bytes_data=None):
        if not bytes_data or len(bytes_data) < 2:
            return
        audio = bytes_data[1:]
        if self.dg_ready and self.dg:
            try:    await self.dg.send(audio)
            except Exception: pass
        elif len(self.buf) < 120:
            self.buf.append(audio)

    async def _open_deepgram(self):
        auth = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        for kwarg in (_HEADERS_KWARG, "additional_headers", "extra_headers"):
            try:
                ws = await asyncio.wait_for(
                    websockets.connect(
                        DEEPGRAM_URI,
                        **{kwarg: auth},
                        ping_interval=None,
                        close_timeout=2,
                    ),
                    timeout=15.0,
                )
                return ws
            except TypeError:
                continue
            except asyncio.TimeoutError:
                raise TimeoutError("Deepgram connection timed out after 15 s")
            except Exception as exc:
                raise exc
        raise RuntimeError("No compatible websockets header kwarg found")

    async def _keepalive_loop(self):
        while not self._closing:
            await asyncio.sleep(5)
            if self.dg is None:
                continue
            try:
                await self.dg.send(KEEPALIVE_MSG)
            except Exception:
                pass

    async def _init(self):
        try:
            print(f"🔌 [{self.log}] Connecting to Deepgram…")
            try:
                self.dg = await asyncio.wait_for(self._open_deepgram(), timeout=20.0)
                print(f"✅ [{self.log}] Connected")
            except asyncio.TimeoutError:
                await self.send(json.dumps({
                    "type"   : "stt_error",
                    "message": "Deepgram connection timed out. Check API key and internet connection.",
                }))
                return
            except Exception as e:
                await self.send(json.dumps({
                    "type"   : "stt_error",
                    "message": f"Deepgram connection failed: {str(e)}",
                }))
                return

            self.dg_ready = True

            for chunk in self.buf:
                try:    await self.dg.send(chunk)
                except Exception: break
            self.buf.clear()

            await self.send(json.dumps({"type": "stt_ready"}))

            self._tasks.append(asyncio.ensure_future(self._keepalive_loop()))
            await self._relay_loop()

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            try:
                await self.send(json.dumps({"type": "stt_error", "message": str(exc)}))
            except Exception:
                pass

    async def _relay_loop(self):
        while not self._closing:
            if self.dg is None:
                await asyncio.sleep(0.5)
                continue

            try:
                async for raw in self.dg:
                    if self._closing:
                        break
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if data.get("type") != "Results":
                        continue
                    alts = data.get("channel", {}).get("alternatives", [])
                    if not alts:
                        continue
                    text     = alts[0].get("transcript", "").strip()
                    is_final = data.get("is_final", False)
                    if text:
                        await self.send(json.dumps({
                            "type"    : "transcript",
                            "text"    : text,
                            "is_final": is_final,
                            "speaker" : self.label,
                        }))
                        print(
                            f"📝 [{self.log}] "
                            f"{'FINAL' if is_final else 'interim'}: {text[:70]}"
                        )

                if self._closing:
                    break
                raise ConnectionResetError("stream closed")

            except asyncio.CancelledError:
                return

            except Exception as exc:
                if self._closing:
                    break
                print(f"⚠️  [{self.log}] dropped ({str(exc)[:60]}) — reconnecting in 1 s…")
                await asyncio.sleep(1)
                try:
                    self.dg = await asyncio.wait_for(self._open_deepgram(), timeout=20.0)
                    print(f"✅ [{self.log}] reconnected")
                except asyncio.TimeoutError:
                    print(f"❌ [{self.log}] reconnect timeout — retrying in 3 s")
                    await asyncio.sleep(3)
                except Exception as re_err:
                    print(f"❌ [{self.log}] reconnect failed: {re_err} — retrying in 3 s")
                    await asyncio.sleep(3)