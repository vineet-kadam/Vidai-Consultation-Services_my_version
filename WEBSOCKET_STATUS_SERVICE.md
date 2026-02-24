# WebSocket Status Service Documentation

## Overview

The WebSocket Status Service provides non-intrusive monitoring of WebSocket connections across the application. It allows the frontend to query the backend for information about active socket connections without affecting any existing functionality.

**Design Principle**: This service is read-only and passive. It only provides status information without modifying any existing WebSocket behavior or application logic.

---

## Backend Components

### 1. **SocketStatusService** (`backend/consultation/services.py`)

A thread-safe service class that tracks WebSocket connection status in memory.

#### Key Features:
- **Thread-safe registry** of active socket connections
- **Non-blocking** status queries
- **Zero impact** on existing WebSocket consumers
- Type-based socket organization

#### Available Methods:

```python
# Register a new socket connection
SocketStatusService.register_socket(
    socket_id="unique-id",
    socket_type="call|stt|stt_room|stt_sales|stt_admin",
    user_info={"role": "doctor", "name": "Dr. Smith"}
)

# Unregister a socket
SocketStatusService.unregister_socket(socket_id)

# Get status of a specific socket
status = SocketStatusService.get_socket_status(socket_id)

# Get all active sockets
all_sockets = SocketStatusService.get_all_sockets()

# Get sockets by type
call_sockets = SocketStatusService.get_sockets_by_type("call")

# Get socket count
count = SocketStatusService.get_socket_count()

# Get comprehensive summary (used by REST API)
info = SocketStatusService.get_socket_info_summary()
```

### 2. **SocketStatusView** (`backend/consultation/views.py`)

REST API endpoint that exposes socket status information.

#### Endpoint: `GET /consultation/socket-status/`

**Example Response:**
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

**How to Test:**
```bash
curl -X GET "http://localhost:8000/consultation/socket-status/"
```

---

## Frontend Components

### 1. **SocketStatusService** (`frontend/src/services/SocketStatusService.js`)

A singleton service that manages WebSocket status polling and notifications.

#### Key Features:
- **Automatic polling** of backend socket status
- **subscriber pattern** for real-time updates
- **Connection testing** capability
- **Error tracking** and reporting
- **Zero dependencies** on existing components

#### Initialize in Your App:

```javascript
import SocketStatusService from './services/SocketStatusService';

// In App.js or main component
useEffect(() => {
  // Initialize with 10-second polling interval
  SocketStatusService.initialize(10000);
  
  return () => {
    SocketStatusService.stopPolling();
  };
}, []);
```

#### Available Methods:

```javascript
// Get current status
const status = SocketStatusService.getStatus();

// Check if socket is active
const isActive = SocketStatusService.isSocketActive();

// Get socket count by type
const counts = SocketStatusService.getSocketCountByType();

// Get URLs
const wsUrl = SocketStatusService.getWsUrl();
const apiUrl = SocketStatusService.getApiUrl();

// Get available endpoints
const endpoints = SocketStatusService.getEndpoints();

// Get last error
const error = SocketStatusService.getLastError();

// Test connection (non-blocking)
const canConnect = await SocketStatusService.testConnection();

// Subscribe to updates
const unsubscribe = SocketStatusService.subscribe((status) => {
  console.log('Socket status updated:', status);
});

// Get formatted status for debugging
console.log(SocketStatusService.getFormattedStatus());

// Stop polling
SocketStatusService.stopPolling();
```

### 2. **useSocketStatus Hook** (`frontend/src/hooks/useSocketStatus.js`)

A React hook for convenient access to socket status in components.

#### Usage Example:

```javascript
import useSocketStatus from '../hooks/useSocketStatus';

function SocketStatusIndicator() {
  const socketStatus = useSocketStatus(10000); // 10-second polling
  
  return (
    <div className="socket-status">
      <p>
        Socket Status: {socketStatus.active ? '✅ Active' : '❌ Inactive'}
      </p>
      <p>Active Connections: {socketStatus.totalSockets}</p>
      {socketStatus.isConnecting && <p>Updating...</p>}
      {socketStatus.lastError && (
        <p style={{ color: 'red' }}>Error: {socketStatus.lastError}</p>
      )}
      
      {Object.keys(socketStatus.socketsByType).length > 0 && (
        <div>
          <h4>Connections by Type:</h4>
          <ul>
            {Object.entries(socketStatus.socketsByType).map(([type, count]) => (
              <li key={type}>{type}: {count}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SocketStatusIndicator;
```

---

## Integration Examples

### Example 1: Simple Status Indicator Component

```javascript
// src/components/SocketStatusIndicator.js
import React from 'react';
import useSocketStatus from '../hooks/useSocketStatus';

export default function SocketStatusIndicator() {
  const { active, totalSockets, lastError } = useSocketStatus(15000);
  
  return (
    <div style={{
      padding: '10px',
      backgroundColor: active ? '#d1fae5' : '#fee2e2',
      borderRadius: '4px',
      marginBottom: '10px'
    }}>
      <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
        {active ? '🟢' : '🔴'} WebSocket {active ? 'Active' : 'Inactive'}
      </span>
      {totalSockets > 0 && (
        <span style={{ marginLeft: '10px', fontSize: '12px', color: '#666' }}>
          ({totalSockets} connections)
        </span>
      )}
      {lastError && (
        <p style={{ color: '#dc2626', fontSize: '12px', margin: '5px 0 0 0' }}>
          ⚠️ {lastError}
        </p>
      )}
    </div>
  );
}
```

### Example 2: Debug Console in Development

```javascript
// src/components/DebugConsole.js
import React, { useState } from 'react';
import SocketStatusService from '../services/SocketStatusService';

export default function DebugConsole() {
  const [showDebug, setShowDebug] = useState(false);
  
  if (!showDebug) {
    return (
      <button 
        onClick={() => setShowDebug(true)}
        style={{ position: 'fixed', bottom: '10px', right: '10px' }}
      >
        📊 Debug
      </button>
    );
  }
  
  const status = SocketStatusService.getStatus();
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      width: '400px',
      maxHeight: '400px',
      overflow: 'auto',
      backgroundColor: '#1f2937',
      color: '#f3f4f6',
      padding: '15px',
      borderRadius: '4px 4px 0 0',
      fontSize: '12px',
      fontFamily: 'monospace',
      zIndex: 10000
    }}>
      <button 
        onClick={() => setShowDebug(false)}
        style={{ float: 'right', backgroundColor: '#374151', color: '#f3f4f6', border: 'none', cursor: 'pointer' }}
      >
        ✕
      </button>
      <h4 style={{ marginTop: 0 }}>🔌 Socket Status Debug</h4>
      <pre>{JSON.stringify(status, null, 2)}</pre>
      <button 
        onClick={() => console.log(SocketStatusService.getFormattedStatus())}
        style={{ marginTop: '10px', padding: '5px 10px' }}
      >
        Copy to Console
      </button>
    </div>
  );
}
```

### Example 3: Conditional Component Rendering

```javascript
function MeetingRoom() {
  const { active: websocketActive, lastError } = useSocketStatus();
  
  if (!websocketActive) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>⚠️ WebSocket connection unavailable</p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          {lastError || 'Unable to establish real-time connection'}
        </p>
        <button onClick={() => window.location.reload()}>Retry Connection</button>
      </div>
    );
  }
  
  // Normal component rendering
  return <YourMeetingComponent />;
}
```

---

## Optional: Enhance Existing Consumers (Optional - Not Required)

If you want the service to also track WebSocket registrations, you can optionally update existing consumers to register/unregister themselves. However, this is **not required** - the service works as a passive monitoring tool.

### Example: Update CallConsumer

```python
# In backend/consultation/consumers.py
from .services import SocketStatusService

class CallConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room"]
        self.room_group_name = f"call_{self.room_name}"
        self.peer_id = str(uuid.uuid4())[:8]
        
        # OPTIONAL: Register with SocketStatusService
        SocketStatusService.register_socket(
            socket_id=self.peer_id,
            socket_type="call",
            user_info={
                "room": self.room_name,
                "peer_id": self.peer_id,
            }
        )
        
        # ... rest of your connect logic ...

    async def disconnect(self, close_code):
        # OPTIONAL: Unregister from SocketStatusService
        SocketStatusService.unregister_socket(self.peer_id)
        
        # ... rest of your disconnect logic ...
```

---

## API Reference

### Backend API Endpoint

**GET** `/consultation/socket-status/`

**Query Parameters**: None (uses GET only)

**Response Status Codes**:
- `200 OK` - Successfully retrieved socket status
- `500 Internal Server Error` - Error retrieving status

**Response Body**:
```json
{
  "active": boolean,
  "total_sockets": number,
  "sockets_by_type": { "type": count, ... },
  "timestamp": "ISO 8601 datetime",
  "ws_endpoints": { "endpoint_name": "url_pattern", ... }
}
```

### Frontend Service Methods

All methods are documented in the service files with JSDoc comments. Key methods:

| Method | Return Type | Description |
|--------|------------|-------------|
| `initialize(frequency)` | void | Start polling |
| `stopPolling()` | void | Stop polling |
| `getStatus()` | Object | Get current status |
| `isSocketActive()` | boolean | Check if any socket is active |
| `getSocketCountByType()` | Object | Get counts by type |
| `getTotalSocketCount()` | number | Total socket count |
| `subscribe(callback)` | Function | Subscribe to updates (returns unsubscribe fn) |
| `testConnection(path)` | Promise\<boolean\> | Test WebSocket connectivity |
| `getFormattedStatus()` | string | Get human-readable status |

---

## Important Notes

### ✅ Safe to Use
- ✅ **Read-only**: Service only reads status, doesn't modify behavior
- ✅ **Non-blocking**: All operations are asynchronous
- ✅ **No dependencies**: Doesn't require changes to existing code
- ✅ **Backward compatible**: Doesn't affect any existing functionality
- ✅ **Thread-safe**: Uses locks for safe concurrent access

### ⚠️ Best Practices
- Initialize the service once in your main App component
- Clean up polling intervals on component unmount
- Use the React hook (`useSocketStatus`) in components for automatic cleanup
- Don't make frequent backend calls yourself; use the polling mechanism
- Cache the status locally in your components

### 🔧 Troubleshooting

**Service not updating:**
- Check that polling has been initialized: `SocketStatusService.initialize()`
- Verify network connectivity to backend API
- Check browser console for errors

**High polling frequency impact:**
- If concerned about performance, adjust polling frequency
- Default is 10 seconds, which is typically acceptable
- Can be increased to 30000ms or more for less frequent updates

**Connection test always fails:**
- The test connection endpoint (`ws/call/test-socket/`) doesn't need to exist
- It just tests WebSocket protocol connectivity
- Failure might indicate network or server issues

---

## Testing the Service

### In Browser Console:

```javascript
// Import the service
import SocketStatusService from './services/SocketStatusService.js';

// Initialize
SocketStatusService.initialize(5000);

// Check status
SocketStatusService.getStatus();

// Print formatted status
console.log(SocketStatusService.getFormattedStatus());

// Subscribe to updates
SocketStatusService.subscribe(status => console.log('Updated:', status));

// Test connection
await SocketStatusService.testConnection();
```

### In Backend (Django Shell):

```python
from consultation.services import SocketStatusService

# Get all sockets
sockets = SocketStatusService.get_all_sockets()
print(f"Total sockets: {SocketStatusService.get_socket_count()}")

# Get summary
info = SocketStatusService.get_socket_info_summary()
print(info)

# Get sockets by type
call_sockets = SocketStatusService.get_sockets_by_type("call")
print(f"Call sockets: {len(call_sockets)}")
```

---

## Files Created/Modified

**Backend**:
- ✅ Modified: `backend/consultation/services.py` - Added `SocketStatusService`
- ✅ Modified: `backend/consultation/views.py` - Added `SocketStatusView`
- ✅ Modified: `backend/consultation/urls.py` - Added `/socket-status/` endpoint

**Frontend**:
- ✅ Created: `frontend/src/services/SocketStatusService.js` - Main service
- ✅ Created: `frontend/src/hooks/useSocketStatus.js` - React hook

---

## Future Enhancements

Possible future additions (not included in current version):
- WebSocket health check endpoint
- Metrics/analytics about socket connections
- Automatic reconnection logic
- Integration with monitoring/alerting system
- Socket connection history
- Performance statistics

---

## Support

For issues or questions:
1. Check this documentation first
2. Review the inline JSDoc comments in the service files
3. Check browser console and server logs for error messages
4. Test using the commands in the "Testing" section above
