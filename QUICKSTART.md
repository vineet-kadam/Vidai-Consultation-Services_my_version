# WebSocket Status Service - Quick Start Guide

## What Was Created

A complete, non-intrusive WebSocket status monitoring system that doesn't affect any existing functionality.

### Backend (Django)
- **Service**: `SocketStatusService` in [backend/consultation/services.py](backend/consultation/services.py) - Tracks socket status in memory
- **REST API**: `GET /consultation/socket-status/` - Returns socket status info
- **Thread-safe**: Uses locks to prevent race conditions

### Frontend (React)
- **Service**: [frontend/src/services/SocketStatusService.js](frontend/src/services/SocketStatusService.js) - Polls backend and notifies subscribers
- **React Hook**: [frontend/src/hooks/useSocketStatus.js](frontend/src/hooks/useSocketStatus.js) - Easy component integration

### Documentation
- [WEBSOCKET_STATUS_SERVICE.md](WEBSOCKET_STATUS_SERVICE.md) - Complete documentation with examples

---

## Quick Usage

### Backend - Get Socket Status
```python
from consultation.services import SocketStatusService

# Get summary
info = SocketStatusService.get_socket_info_summary()
# Returns: { active, total_sockets, sockets_by_type, timestamp, ws_endpoints }
```

### Frontend - Use React Hook
```javascript
import useSocketStatus from '../hooks/useSocketStatus';

function MyComponent() {
  const { active, totalSockets, socketsByType } = useSocketStatus();
  
  return (
    <div>
      Socket Status: {active ? '✅ Active' : '❌ Inactive'}
      <p>Connections: {totalSockets}</p>
    </div>
  );
}
```

### Frontend - Use Service Directly
```javascript
import SocketStatusService from '../services/SocketStatusService';

// Initialize once in App.js
SocketStatusService.initialize(10000); // Poll every 10 seconds

// Get status anytime
const status = SocketStatusService.getStatus();

// Subscribe to changes
SocketStatusService.subscribe(status => {
  console.log('Socket status updated:', status);
});
```

---

## API Endpoint

**GET** `/consultation/socket-status/`

**Response Example:**
```json
{
  "active": true,
  "total_sockets": 3,
  "sockets_by_type": {
    "call": 2,
    "stt_room": 1
  },
  "timestamp": "2024-02-24T10:30:45.123456",
  "ws_endpoints": {
    "call": "/ws/call/<room>/",
    "stt": "/ws/stt/",
    "stt_room": "/ws/stt/room/?role=<role>&name=<name>",
    "stt_sales": "/ws/stt/sales/",
    "stt_admin": "/ws/stt/admin/"
  }
}
```

---

## Key Features

✅ **Zero Impact** - Read-only, doesn't modify existing code  
✅ **Non-blocking** - All operations are async  
✅ **Thread-safe** - Backend uses locks for concurrent access  
✅ **Automatic Polling** - Frontend polls backend at configurable intervals  
✅ **Real-time Updates** - Subscribers get notified of status changes  
✅ **Easy Integration** - React hook handles setup/cleanup automatically  
✅ **Detailed Logging** - Track socket activity and connection types  

---

## Files Modified/Created

**Modified:**
- `backend/consultation/services.py` - Added SocketStatusService
- `backend/consultation/views.py` - Added SocketStatusView
- `backend/consultation/urls.py` - Added /socket-status/ endpoint

**Created:**
- `frontend/src/services/SocketStatusService.js`
- `frontend/src/hooks/useSocketStatus.js`
- `WEBSOCKET_STATUS_SERVICE.md` (detailed documentation)
- `QUICKSTART.md` (this file)

---

## Testing

### Test Backend API
```bash
curl -X GET "http://localhost:8000/consultation/socket-status/"
```

### Test in React Component
```javascript
function DebugComponent() {
  createEffect(() => {
    SocketStatusService.initialize();
    return () => SocketStatusService.stopPolling();
  }, []);

  const status = useSocketStatus();
  console.log(SocketStatusService.getFormattedStatus());
}
```

---

## No Breaking Changes

✅ Existing WebSocket consumers work unchanged  
✅ No modifications to CallConsumer, STTConsumer, etc.  
✅ No database migrations needed  
✅ No configuration changes required  
✅ Purely additive feature  

---

For detailed documentation, see [WEBSOCKET_STATUS_SERVICE.md](WEBSOCKET_STATUS_SERVICE.md)
