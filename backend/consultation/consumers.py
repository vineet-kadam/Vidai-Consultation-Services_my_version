"""
consultation/consumers.py

Two consumers:
  1. CallConsumer  – WebRTC signalling
  2. STTConsumer   – TWO separate Deepgram connections (doctor + patient)
                     with improved timeout handling and error recovery
"""

import asyncio
import json
import os

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


# =============================================================================
# WebRTC Signalling
# =============================================================================

class CallConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name       = self.scope["url_route"]["kwargs"]["room"]
        self.room_group_name = f"call_{self.room_name}"
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        print(f"✅ [Call] connected  room={self.room_name}")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        print(f"❌ [Call] disconnected  room={self.room_name}  code={close_code}")

    async def receive(self, text_data):
        data = json.loads(text_data)
        print(f"📩 [Call] recv '{data.get('type')}' from {self.channel_name}")
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "signal_message", "payload": data, "sender": self.channel_name},
        )

    async def signal_message(self, event):
        if self.channel_name == event["sender"]:
            return
        await self.send(text_data=json.dumps(event["payload"]))


# =============================================================================
# STT — two parallel Deepgram connections with improved error handling
# =============================================================================

class STTConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        await self.accept()
        print("✅ [STT] client accepted")

        self.dg_doctor   = None
        self.dg_patient  = None
        self.buf_doctor  = []
        self.buf_patient = []
        self.dg_ready    = False
        self._tasks      = []
        self._closing    = False

        self._tasks.append(asyncio.ensure_future(self._init_deepgram()))

    async def disconnect(self, close_code):
        print(f"❌ [STT] disconnected  code={close_code}")
        self._closing = True
        
        for t in self._tasks:
            if not t.done():
                t.cancel()
                try:    await t
                except asyncio.CancelledError: pass

        for ws in (self.dg_doctor, self.dg_patient):
            if ws:
                try:    await ws.close()
                except Exception: pass

    # ── Incoming audio from React (prefixed binary frames only) ──────────────

    async def receive(self, text_data=None, bytes_data=None):
        if not bytes_data or len(bytes_data) < 2:
            return

        prefix = bytes_data[0]
        audio  = bytes_data[1:]   # strip the 1-byte routing prefix

        if prefix == DOCTOR_PREFIX:
            if self.dg_ready and self.dg_doctor:
                try:    await self.dg_doctor.send(audio)
                except Exception: pass
            elif len(self.buf_doctor) < 120:
                self.buf_doctor.append(audio)

        elif prefix == PATIENT_PREFIX:
            if self.dg_ready and self.dg_patient:
                try:    await self.dg_patient.send(audio)
                except Exception: pass
            elif len(self.buf_patient) < 120:
                self.buf_patient.append(audio)

    # ── Open one Deepgram WS with timeout ─────────────────────────────────────

    async def _open_deepgram(self):
        """Open Deepgram WebSocket with 15 second timeout"""
        auth = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
        
        # Try with timeout
        try:
            for kwarg in (_HEADERS_KWARG, "additional_headers", "extra_headers"):
                try:
                    # FIXED: Add explicit timeout of 15 seconds
                    ws = await asyncio.wait_for(
                        websockets.connect(
                            DEEPGRAM_URI, 
                            **{kwarg: auth},
                            ping_interval=None,  # Disable auto-ping, we handle KeepAlive manually
                            close_timeout=2
                        ),
                        timeout=15.0
                    )
                    return ws
                except TypeError:
                    continue
                except asyncio.TimeoutError:
                    raise TimeoutError(f"Deepgram connection timed out after 15s (kwarg={kwarg})")
                except Exception as exc:
                    raise exc
            raise RuntimeError("No compatible websockets header kwarg found")
        except Exception as e:
            print(f"❌ [STT] Deepgram connection failed: {e}")
            raise

    # ── KeepAlive loop — runs independently per connection ───────────────────

    async def _keepalive_loop(self, label):
        """Send Deepgram KeepAlive every 5 s to prevent idle timeout (10 s)."""
        while not self._closing:
            await asyncio.sleep(5)
            ws = self.dg_doctor if label == "Doctor" else self.dg_patient
            if ws is None:
                continue
            try:
                await ws.send(KEEPALIVE_MSG)
            except Exception:
                pass   # relay loop handles reconnection

    # ── Initialise both connections ───────────────────────────────────────────

    async def _init_deepgram(self):
        """
        FIXED: Better error handling and timeout management
        """
        try:
            print("🔌 [STT] Connecting to Deepgram (2 connections)...")
            
            # Open both connections with individual timeouts
            try:
                self.dg_doctor = await asyncio.wait_for(
                    self._open_deepgram(),
                    timeout=20.0
                )
                print("✅ [STT] Doctor connection established")
            except asyncio.TimeoutError:
                print("❌ [STT] Doctor connection timeout after 20s")
                await self.send(json.dumps({
                    "type": "stt_error",
                    "message": "Deepgram doctor connection timed out. Check your API key and internet connection."
                }))
                return
            except Exception as e:
                print(f"❌ [STT] Doctor connection failed: {e}")
                await self.send(json.dumps({
                    "type": "stt_error",
                    "message": f"Deepgram doctor connection failed: {str(e)}"
                }))
                return
            
            try:
                self.dg_patient = await asyncio.wait_for(
                    self._open_deepgram(),
                    timeout=20.0
                )
                print("✅ [STT] Patient connection established")
            except asyncio.TimeoutError:
                print("❌ [STT] Patient connection timeout after 20s")
                await self.send(json.dumps({
                    "type": "stt_error",
                    "message": "Deepgram patient connection timed out. Check your API key and internet connection."
                }))
                return
            except Exception as e:
                print(f"❌ [STT] Patient connection failed: {e}")
                await self.send(json.dumps({
                    "type": "stt_error",
                    "message": f"Deepgram patient connection failed: {str(e)}"
                }))
                return

            self.dg_ready = True
            print("✅ [STT] Both Deepgram connections open")

            # Flush buffered audio
            for chunk in self.buf_doctor:
                try:    await self.dg_doctor.send(chunk)
                except Exception: break
            self.buf_doctor.clear()

            for chunk in self.buf_patient:
                try:    await self.dg_patient.send(chunk)
                except Exception: break
            self.buf_patient.clear()

            await self.send(json.dumps({"type": "stt_ready"}))

            # Start per-connection KeepAlive tasks
            self._tasks.append(asyncio.ensure_future(self._keepalive_loop("Doctor")))
            self._tasks.append(asyncio.ensure_future(self._keepalive_loop("Patient")))

            # Run both relay loops forever
            await asyncio.gather(
                self._relay_loop("Doctor"),
                self._relay_loop("Patient"),
            )

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            print(f"❌ [STT] init error: {exc}")
            try:
                await self.send(json.dumps({"type": "stt_error", "message": str(exc)}))
            except Exception:
                pass

    # ── Relay loop with auto-reconnect ────────────────────────────────────────

    async def _relay_loop(self, label):
        """
        Stream Deepgram results → React.
        On any disconnect (including 1011 timeout), wait 1 s then reconnect.
        """
        while not self._closing:
            ws = self.dg_doctor if label == "Doctor" else self.dg_patient
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
                            f"📝 [STT] [{label}] "
                            f"{'FINAL' if is_final else 'interim'}: {text[:70]}"
                        )

                # Loop ended normally → reconnect
                if self._closing:
                    break
                raise ConnectionResetError("stream closed")

            except asyncio.CancelledError:
                return   # clean shutdown

            except Exception as exc:
                if self._closing:
                    break
                    
                code = str(exc)
                print(f"⚠️  [STT] [{label}] dropped ({code[:60]}) — reconnecting in 1 s…")
                await asyncio.sleep(1)
                
                try:
                    new_ws = await asyncio.wait_for(
                        self._open_deepgram(),
                        timeout=20.0
                    )
                    if label == "Doctor":
                        self.dg_doctor  = new_ws
                    else:
                        self.dg_patient = new_ws
                    print(f"✅ [STT] [{label}] reconnected")
                except asyncio.TimeoutError:
                    print(f"❌ [STT] [{label}] reconnect timeout — retrying in 3 s")
                    await asyncio.sleep(3)
                except Exception as re:
                    print(f"❌ [STT] [{label}] reconnect failed: {re} — retrying in 3 s")
                    await asyncio.sleep(3)