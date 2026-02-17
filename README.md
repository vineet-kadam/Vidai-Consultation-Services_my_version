# Medical Video Consultation — Full Setup Guide


## 1. Backend Setup

### Install dependencies (add to requirements.txt)
```
django
djangorestframework
djangorestframework-simplejwt
django-channels
channels-redis
daphne
psycopg2-binary
Pillow             ← NEW (for profile photo ImageField)
websockets
python-decouple    ← optional, for .env
```

Install:
```bash
pip install -r requirements.txt
```

### settings.py — key settings to have
```python
INSTALLED_APPS = [
    ...
    'channels',
    'rest_framework',
    'corsheaders',
    'consultation',
]

# Database — PostgreSQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME':   'medical_db',
        'USER':   'your_db_user',
        'PASSWORD': 'your_password',
        'HOST':   'localhost',
        'PORT':   '5432',
    }
}

# Channels — Redis as the message broker
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [('127.0.0.1', 6379)],
        },
    },
}

# JWT settings
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
}

# CORS — allow React dev server
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]

# Media files (profile photos)
MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# DRF — use JWT auth
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
}
```

### Run migrations
```bash
# Create migrations for the new models
python manage.py makemigrations consultation

# Apply them to the database
python manage.py migrate

# Create a superuser (admin account)
python manage.py createsuperuser
```

### Start the server
```bash
# Use daphne for WebSocket support (replaces runserver for production)
daphne -b 0.0.0.0 -p 8000 medical_consultation.asgi:application

# OR for development (also works with channels if ASGI configured)
python manage.py runserver
```

---

## 2. Frontend Setup

```bash
cd frontend
npm install
npm start        # opens http://localhost:3000
```

---

## 3. First-Time Flow (step by step)

### Step 1 — Admin creates clinic
1. Log in with superuser account → lands on `/admin`
2. Fill in "Create New Clinic" → click Create

### Step 2 — Admin creates a doctor account
1. In "Create User Account", select role = **Doctor**
2. Fill username, password, first/last name, email, mobile, department
3. Select the clinic they work at → Create

### Step 3 — Admin creates a patient account
1. Same form, role = **Patient**
2. Assign to a clinic → Create

### Step 4 — Doctor sets availability
1. Doctor logs in → lands on `/doctor`
2. Click "🕐 Set Availability" in the top bar
3. Select clinic, day of week, start/end time → Save
4. Repeat for each working day

### Step 5 — Patient books appointment
1. Patient logs in → lands on `/patient`
2. Click "📝 Book Appointment" in the left navbar
3. Select clinic → appointment type → doctor → fill details → Confirm

### Step 6 — Patient joins appointment (on the day)
1. Patient clicks "🎥 Join Appointment" in navbar
2. Today's appointments show up
3. If the doctor is within their set working hours → green "🟢 Start" button
4. Click Start → enters video call

### Step 7 — Doctor starts appointment (alternative flow)
1. Doctor sees the appointment on their calendar
2. Clicks the appointment day → card pops up with all 13 fields
3. Clicks "🟢 Start Appointment" → video call begins

### Step 8 — During call
- Both doctor and patient can see/hear each other (WebRTC)
- Doctor clicks "🎙️ Start Transcription" → Deepgram listens to both
- Doctor: `audio → prefix 0x01 → Deepgram channel 1`
- Patient: `audio → prefix 0x02 → Deepgram channel 2`
- Transcript appears as: `Doctor: ...\nPatient: ...`
- Auto-saved every 10 seconds to `Meeting.speech_to_text`

### Step 9 — End call
- Doctor clicks "🔴 End Call"
- Final transcript saved, `Meeting.status = 'ended'`

---

## 4. API Reference

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/login/` | No | Login → returns role + JWT |
| GET  | `/api/profile/` | Yes | Get logged-in user's profile |
| POST | `/api/create-user/` | Admin | Create patient or doctor |
| POST | `/api/create-clinic/` | Admin | Create clinic |
| GET  | `/api/clinics/` | No | List all clinics |
| GET  | `/api/doctors/?clinic=<id>` | No | List doctors |
| GET  | `/api/doctor/availability/<id>/` | No | Doctor's working hours |
| POST | `/api/doctor/set-availability/` | Doctor | Set working hours |
| GET  | `/api/doctor/available/<id>/` | Yes | Is doctor online now? |
| GET  | `/api/doctor/appointments/` | Doctor | Doctor's calendar |
| GET  | `/api/patient/appointments/` | Patient | Patient's calendar |
| POST | `/api/book-appointment/` | Patient | Book new appointment |
| POST | `/api/meeting/start/` | Yes | Start video call |
| POST | `/api/meeting/end/` | Yes | End + save transcript |
| POST | `/api/append-transcript/` | Yes | Append transcript line |
| GET  | `/api/meeting/<id>/` | Yes | Get meeting details |

---

## 5. WebSocket Routes (unchanged)

| URL | Consumer | Purpose |
|-----|----------|---------|
| `ws/call/<room>/` | `CallConsumer` | WebRTC signalling |
| `ws/stt/` | `STTConsumer` | Deepgram dual-stream STT |

---

## 6. Meeting DB Structure (as required)

```
Meeting
├── meeting_id     (PK, auto-increment)
├── room_id        (unique UUID string, auto-generated)
├── meeting_type   (CONSULT / SALES / DEMO)
├── appointment_type (consultation / semen_collection / pathology / ultrasound / surgery)
├── scheduled_time (datetime)
├── duration       (int, minutes)
├── participants   (JSONField: [{name, email, role}])
├── patient_id     (FK → User)
├── doctor_id      (FK → User)
├── clinic         (FK → Clinic)
├── appointment_reason (CharField)
├── department     (CharField)
├── remark         (TextField)
├── speech_to_text (TextField — full Deepgram transcript)
├── status         (scheduled / started / ended / cancelled)
├── created_at     (auto)
└── updated_at     (auto)
```

---

## 7. Key Design Decisions

- **Backend-centric**: All business logic lives in Django views. React only displays.
- **DoctorAvailability gates the call**: The "Start" button checks the doctor's set hours in real-time via API — no manual online/offline toggle needed.
- **Speech stored in Meeting**: The STT transcript is appended line-by-line during the call and fully saved when the call ends.
- **Participants JSON**: Stores `[{name, email, role}]` exactly as per spec.
- **Backward compatible**: Old `Patient` model kept. Old Deepgram/WebRTC consumers unchanged.
- **Three roles**: `admin` → `/admin`, `doctor` → `/doctor`, `patient` → `/patient`. All use same login page.

---

