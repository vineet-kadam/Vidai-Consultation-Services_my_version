# Frontend Logging for WebSocket Status Service

## Overview

Comprehensive logging has been added to the frontend WebSocket Status Service to help with debugging, monitoring, and understanding the system's behavior. All logging is configurable and can be easily enabled or disabled.

---

## What Gets Logged

### SocketStatusService Logs

#### 1. **Service Initialization**
```
[SocketStatusService] Service initialized
```
Logs when the service first initializes, showing the WebSocket and API URLs.

#### 2. **Polling Start/Stop**
```
[SocketStatusService] Initializing with poll frequency: 10000ms
[SocketStatusService] Starting polling
[SocketStatusService] Polling started with interval: 10000ms
[SocketStatusService] Stopping polling
```
Tracks when polling is started or stopped with the configured frequency.

#### 3. **Status Fetches**
```
[SocketStatusService] Fetching socket status from https://api.example.com/consultation/socket-status/
[SocketStatusService] Status fetched successfully
  active: true
  totalSockets: 3
  socketsByType: { call: 2, stt_room: 1 }
  prevTotal: 1
  changed: true
```
Logs each fetch attempt with results and whether status changed.

#### 4. **Fetch Errors**
```
[SocketStatusService] Fetch error:
  error: "HTTP 500"
  url: "https://api.example.com/consultation/socket-status/"
```
Logs any errors during fetch with error details.

#### 5. **Listener Management**
```
[SocketStatusService] New subscriber added (total: 1)
[SocketStatusService] Notifying 5 listener(s)
  status: active
  sockets: 3
[SocketStatusService] Subscriber removed (total: 2)
```
Tracks subscribers and notifications to listeners.

#### 6. **Connection Testing**
```
[SocketStatusService] Testing connection to wss://api.example.com/ws/call/test-socket/
[SocketStatusService] Connection test successful
[SocketStatusService] Connection test timeout
[SocketStatusService] Connection test closed
```
Logs WebSocket connection test results.

#### 7. **Service Cleanup**
```
[SocketStatusService] Clearing service state
[SocketStatusService] Service cleared
```
Logs when service is cleared/reset.

---

### React Hook Logs

#### useSocketStatus Hook
```
[useSocketStatus:a1b2c3d] Hook mounted with poll frequency: 10000ms
[useSocketStatus:a1b2c3d] Status updated
  active: true
  totalSockets: 3
  socketsByType: { call: 2 }
[useSocketStatus:a1b2c3d] Hook unmounted
```
Each hook instance gets a unique ID to track mount/unmount cycles and status updates.

---

### Component Logs

#### SocketStatusIndicator Component
```
[SocketStatusIndicator:x1y2z3w] Component mounted
  compact: true
  showDetails: false
  pollFrequency: 10000
[SocketStatusIndicator:x1y2z3w] Status changed
  active: true
  totalSockets: 3
  socketsByType: { call: 2, stt_room: 1 }
  lastError: null
[SocketStatusIndicator:x1y2z3w] Component unmounted
```
Tracks component lifecycle and status changes.

---

## How to Use

### 1. **View Logs in Browser Console**

Open browser DevTools (F12 or Ctrl+Shift+I) and go to the **Console** tab:

```
Open Console → All logs prefixed with [SocketStatusService], [useSocketStatus], [SocketStatusIndicator]
```

### 2. **Enable/Disable Logging**

```javascript
import SocketStatusService from './services/SocketStatusService';

// Disable logging
SocketStatusService.setLogging(false);

// Enable logging
SocketStatusService.setLogging(true);

// Check if logging is enabled
const isEnabled = SocketStatusService.isLoggingEnabled();
console.log('Logging enabled:', isEnabled);
```

### 3. **Filter Logs in Console**

In browser console, use the filter box to show only specific logs:

```
Filter: [SocketStatusService]  → Shows only service logs
Filter: [useSocketStatus]      → Shows only hook logs
Filter: [SocketStatusIndicator] → Shows only component logs
Filter: Status fetched         → Shows all fetch success logs
Filter: error                  → Shows all error logs
```

---

## Log Levels

### INFO Logs (Default)
- Service initialization
- Polling start/stop
- Successful status fetches
- Subscriber added/removed
- Component mount/unmount

### DEBUG Logs  
- Status updates with details
- Listener notifications
- Component status changes
- Connection test results

### ERROR Logs
- Fetch errors with details
- Listener callback errors
- Connection test failures
- WebSocket errors

---

## Common Log Patterns

### Normal Operation
```
[SocketStatusService] Initializing with poll frequency: 10000ms
[SocketStatusService] Starting polling
[SocketStatusService] Polling started with interval: 10000ms
[SocketStatusService] Fetching socket status from https://...
[SocketStatusService] Status fetched successfully
  active: true
  totalSockets: 2
  socketsByType: { call: 2 }
[useSocketStatus:a1b2c3d] Hook mounted with poll frequency: 10000ms
[useSocketStatus:a1b2c3d] Status updated
  active: true
  totalSockets: 2
  socketsByType: { call: 2 }
```

### Connection Lost
```
[SocketStatusService] Fetching socket status from https://...
[SocketStatusService] Fetch error:
  error: "Failed to fetch"
  url: "https://..."
```

### Component Lifecycle
```
[SocketStatusIndicator:x1y2z3w] Component mounted
  compact: false
  showDetails: true
  pollFrequency: 10000
[SocketStatusIndicator:x1y2z3w] Status changed
  active: true
  totalSockets: 3
  socketsByType: { call: 2, stt_room: 1 }
  lastError: null
[SocketStatusIndicator:x1y2z3w] Component unmounted
```

### Multiple Instances
```
[useSocketStatus:a1b2c3d] Hook mounted with poll frequency: 10000ms
[useSocketStatus:x5y6z7w] Hook mounted with poll frequency: 5000ms
[SocketStatusService] New subscriber added (total: 2)
[SocketStatusService] Notifying 2 listener(s)
  status: active
  sockets: 3
```

---

## Debugging Tips

### 1. **Check Service Initialization**
Look for these logs first:
```
[SocketStatusService] Service initialized
[SocketStatusService] Initializing with poll frequency: 10000ms
```

### 2. **Track Polling Issues**
```
[SocketStatusService] Polling started with interval: 10000ms
// Wait 10 seconds then look for:
[SocketStatusService] Fetching socket status from...
[SocketStatusService] Status fetched successfully
// If you don't see this, check for errors
```

### 3. **Debug Component Updates**
Enable the component logs:
```javascript
<SocketStatusIndicator showDetails={true} />
// Watch for:
[SocketStatusIndicator:...] Status changed
```

### 4. **Monitor Listener Count**
```
[SocketStatusService] New subscriber added (total: 1)
[SocketStatusService] Notifying 1 listener(s)
// The total should indicate how many components are listening
```

### 5. **Test Connection**
```javascript
await SocketStatusService.testConnection();
// Watch for:
[SocketStatusService] Testing connection to wss://...
[SocketStatusService] Connection test successful
// or
[SocketStatusService] Connection test timeout
```

---

## Performance Monitoring

### Fetch Performance
Check how long fetches take by looking at the timestamp between:
```
[SocketStatusService] Fetching socket status from...
[SocketStatusService] Status fetched successfully
```

### Memory Leaks
Monitor listener count over time:
```
[SocketStatusService] New subscriber added (total: 1)
[SocketStatusService] Subscriber removed (total: 0)
// total should return to 0 when components unmount
```

### Update Frequency
Check the "changed" flag in fetch logs:
```
[SocketStatusService] Status fetched successfully
  changed: true   // No unnecessary updates
  changed: false  // Status hasn't changed, no listener notifications
```

---

## Turning Off Logging for Production

At the start of your App.js:

```javascript
import SocketStatusService from './services/SocketStatusService';

// Disable logging in production
if (process.env.NODE_ENV === 'production') {
  SocketStatusService.setLogging(false);
}

// Or conditionally based on a flag
const DEBUG = localStorage.getItem('DEBUG_SOCKET_SERVICE') === 'true';
SocketStatusService.setLogging(DEBUG);
```

---

## Log Format

### Service Logs
```
[SocketStatusService] Message description
Additional details in object format:
  key1: value1
  key2: value2
```

### Hook Logs
```
[useSocketStatus:uniqueId] Message description
Unique ID helps track multiple hook instances
```

### Component Logs
```
[SocketStatusIndicator:uniqueId] Message description
Unique ID helps track multiple component instances
```

---

## Example: Complete Log Sequence

Here's what a typical session looks like:

```javascript
// Page load - App.js initializes
[SocketStatusService] Service initialized
  wsUrl: "wss://api.example.com"
  apiUrl: "https://api.example.com"

[SocketStatusService] Initializing with poll frequency: 10000ms
[SocketStatusService] Starting polling
[SocketStatusService] Fetching socket status from https://api.example.com/consultation/socket-status/
[SocketStatusService] Status fetched successfully
  active: true
  totalSockets: 1
  socketsByType: { call: 1 }
  prevTotal: 0
  changed: true

[SocketStatusService] Polling started with interval: 10000ms

// Component mounts - Home page loads
[SocketStatusIndicator:a1b2c3d] Component mounted
  compact: false
  showDetails: true
  pollFrequency: 10000

[useSocketStatus:x5y6z7w] Hook mounted with poll frequency: 10000ms
[SocketStatusService] New subscriber added (total: 1)
[SocketStatusService] Notifying 1 listener(s)
  status: active
  sockets: 1

[useSocketStatus:x5y6z7w] Status updated
  active: true
  totalSockets: 1
  socketsByType: { call: 1 }

[SocketStatusIndicator:a1b2c3d] Status changed
  active: true
  totalSockets: 1
  socketsByType: { call: 1 }
  lastError: null

// Page navigates away - Component unmounts
[SocketStatusIndicator:a1b2c3d] Component unmounted
[useSocketStatus:x5y6z7w] Hook unmounted
[SocketStatusService] Subscriber removed (total: 0)

// Periodic polling continues
[SocketStatusService] Fetching socket status from https://api.example.com/consultation/socket-status/
[SocketStatusService] Status fetched successfully
  active: true
  totalSockets: 2
  socketsByType: { call: 1, stt_room: 1 }
  prevTotal: 1
  changed: true

[SocketStatusService] Notifying 0 listener(s)
// No listeners, so status update is not propagated to components
```

---

## API Reference for Logging

### SocketStatusService Methods

```javascript
// Enable or disable logging
SocketStatusService.setLogging(true);  // Enable
SocketStatusService.setLogging(false); // Disable

// Check if logging is enabled
const isEnabled = SocketStatusService.isLoggingEnabled();

// Manually log current status (useful in console)
console.log(SocketStatusService.getFormattedStatus());
```

---

## Troubleshooting with Logs

### "Service not updating"
Look for:
```
[SocketStatusService] Fetching socket status from...
```
If this doesn't appear, polling may not have started.

### "Socket status always inactive"
Check:
```
[SocketStatusService] Status fetched successfully
  active: false
```
The backend might not have any active sockets, or there's a connectivity issue.

### "Component not re-rendering"
Monitor:
```
[useSocketStatus:...] Status updated
  totalSockets: X
```
If this doesn't appear with changing numbers, status isn't updating.

### "Memory leak suspected"
Track listeners:
```
[SocketStatusService] New subscriber added (total: X)
[SocketStatusService] Subscriber removed (total: Y)
```
The count should equal the number of mounted hooks. If it keeps growing, there might be a memory leak.

---

## Summary

- ✅ All frontend components now have comprehensive logging
- ✅ Logging can be enabled/disabled with `setLogging()`
- ✅ Each hook and component instance gets a unique ID
- ✅ Status changes are logged with details
- ✅ Errors are logged with context
- ✅ No performance impact when logging is disabled
- ✅ Helpful for debugging and monitoring

All logs appear in the browser console (F12) and can be filtered by component type.
