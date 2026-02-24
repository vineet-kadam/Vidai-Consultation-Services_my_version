# WebSocket Status Service - Implementation Guide

## Overview

This guide shows how to integrate the WebSocket Status Service into your existing application.

---

## Step 1: Initialize Service in App.js

Add the service initialization to your main App component:

```javascript
// src/App.js
import React, { useEffect } from 'react';
import SocketStatusService from './services/SocketStatusService';
import './App.css';

function App() {
  useEffect(() => {
    // Initialize WebSocket status service
    // Polling interval: 10 seconds (adjust as needed)
    SocketStatusService.initialize(10000);

    // Cleanup on app unmount
    return () => {
      SocketStatusService.stopPolling();
    };
  }, []);

  return (
    <div className="App">
      {/* Your existing app content */}
    </div>
  );
}

export default App;
```

---

## Step 2: Add Status Indicator to UI

### Option A: Compact Indicator (Minimal)

Add a small indicator in your header or navbar:

```javascript
// src/components/Header.js
import React from 'react';
import SocketStatusIndicator from './SocketStatusIndicator';

function Header() {
  return (
    <header>
      <h1>Medical Consultation System</h1>
      
      {/* Add compact socket status indicator */}
      <div style={{ position: 'absolute', top: 10, right: 10 }}>
        <SocketStatusIndicator compact={true} />
      </div>
    </header>
  );
}

export default Header;
```

### Option B: Full Indicator (Informational)

Add a dashboard-style indicator to your home/admin pages:

```javascript
// src/components/AdminHome.js
import React from 'react';
import SocketStatusIndicator from './SocketStatusIndicator';

function AdminHome() {
  return (
    <div>
      <h1>Admin Dashboard</h1>
      
      {/* Full status indicator with details */}
      <SocketStatusIndicator 
        pollFrequency={15000}
        showDetails={true}
      />

      {/* Rest of your admin content */}
    </div>
  );
}

export default AdminHome;
```

### Option C: Custom Logic with Hook

Use the hook directly for custom UI:

```javascript
// src/components/DoctorHome.js
import React from 'react';
import useSocketStatus from '../hooks/useSocketStatus';

function DoctorHome() {
  const socketStatus = useSocketStatus(10000);

  if (!socketStatus.active) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
        <p>⚠️ Connection lost. Some features may not work properly.</p>
        <p>Please check your internet connection and refresh the page.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Doctor Dashboard</h1>
      <p>Socket Status: {socketStatus.totalSockets} active connections</p>
      
      {/* Your doctor content */}
    </div>
  );
}

export default DoctorHome;
```

---

## Step 3: Conditional Rendering Based on Status

Disable features when WebSocket is unavailable:

```javascript
// src/components/MeetingRoom.js
import { useEffect } from 'react';
import useSocketStatus from '../hooks/useSocketStatus';

export default function MeetingRoom() {
  const { active: websocketActive, lastError } = useSocketStatus();

  // Show warning if WebSocket is not active
  if (!websocketActive) {
    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#fee',
        border: '1px solid #f88',
        borderRadius: '4px',
        color: '#c00'
      }}>
        <h2>⚠️ WebSocket Unavailable</h2>
        <p>Real-time features are currently unavailable.</p>
        {lastError && <p>Error: {lastError}</p>}
        <button onClick={() => window.location.reload()}>
          Retry Connection
        </button>
      </div>
    );
  }

  // Normal meeting room rendering
  return (
    <div>
      {/* Your meeting room component */}
    </div>
  );
}
```

---

## Step 4: Debug Mode (Optional)

Add a debug console for development:

```javascript
// src/components/DebugSocketStatus.js
import React, { useState } from 'react';
import SocketStatusService from '../services/SocketStatusService';

export default function DebugSocketStatus() {
  const [showDebug, setShowDebug] = useState(false);

  if (!showDebug) {
    return (
      <button
        onClick={() => setShowDebug(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '10px 15px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 50,
          fontSize: '12px'
        }}
      >
        📊 Socket Debug
      </button>
    );
  }

  const status = SocketStatusService.getStatus();

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '400px',
      maxHeight: '500px',
      overflow: 'auto',
      backgroundColor: '#1f2937',
      color: '#f3f4f6',
      padding: '15px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '11px',
      zIndex: 1000,
      boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
    }}>
      {/* Close button */}
      <button
        onClick={() => setShowDebug(false)}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          backgroundColor: '#374151',
          color: '#f3f4f6',
          border: 'none',
          width: '24px',
          height: '24px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        ✕
      </button>

      <h4 style={{ marginTop: 0, marginBottom: '10px' }}>🔌 Socket Status Debug</h4>

      <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: '4px' }}>
        <strong>Formatted Status:</strong>
        <pre style={{ margin: '5px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {SocketStatusService.getFormattedStatus()}
        </pre>
      </div>

      <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: '4px' }}>
        <strong>Raw Status Object:</strong>
        <pre style={{ margin: '5px 0 0 0', fontSize: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(status, null, 2)}
        </pre>
      </div>

      <button
        onClick={() => {
          const status = SocketStatusService.getStatus();
          console.log('Current Socket Status:', status);
          console.log(SocketStatusService.getFormattedStatus());
        }}
        style={{
          width: '100%',
          padding: '8px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '5px'
        }}
      >
        Log to Console
      </button>

      <button
        onClick={() => {
          SocketStatusService.testConnection().then(result => {
            console.log('Connection test result:', result);
          });
        }}
        style={{
          width: '100%',
          padding: '8px',
          backgroundColor: '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Test Connection
      </button>
    </div>
  );
}
```

Then add to your App.js (development mode only):

```javascript
import DebugSocketStatus from './components/DebugSocketStatus';

function App() {
  return (
    <div className="App">
      {/* Your app content */}
      
      {/* Debug console in development only */}
      {process.env.NODE_ENV === 'development' && <DebugSocketStatus />}
    </div>
  );
}
```

---

## Step 5: Error Handling

Handle errors gracefully:

```javascript
// src/components/ErrorBoundary.js
import React from 'react';
import useSocketStatus from '../hooks/useSocketStatus';

function ErrorBoundary({ children }) {
  const { active, lastError } = useSocketStatus();

  if (!active && lastError) {
    return (
      <div style={{
        padding: '15px',
        margin: '10px 0',
        backgroundColor: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: '4px',
        color: '#856404'
      }}>
        <strong>Connection Alert:</strong> {lastError}
      </div>
    );
  }

  return children;
}

export default ErrorBoundary;
```

---

## Complete Example: Integrated App.js

Here's a complete example with everything integrated:

```javascript
// src/App.js
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SocketStatusService from './services/SocketStatusService';
import SocketStatusIndicator from './components/SocketStatusIndicator';
import DebugSocketStatus from './components/DebugSocketStatus';

import LoginView from './components/Login';
import DoctorHome from './components/DoctorHome';
import PatientHome from './components/PatientHome';
import AdminHome from './components/AdminHome';
import MeetingRoom from './components/MeetingRoom';

import './App.css';

function App() {
  useEffect(() => {
    // Initialize WebSocket status service
    // This starts polling the backend for socket status
    SocketStatusService.initialize(10000); // Poll every 10 seconds

    // Cleanup when app unmounts
    return () => {
      SocketStatusService.stopPolling();
    };
  }, []);

  return (
    <Router>
      <div className="App">
        {/* Header with status indicator */}
        <header className="app-header">
          <div className="header-content">
            <h1>Vidai Medical Consultation</h1>
            {/* Compact socket status in header */}
            <SocketStatusIndicator compact={true} />
          </div>
        </header>

        {/* Main routes */}
        <main className="app-main">
          <Routes>
            <Route path="/login" element={<LoginView />} />
            <Route path="/doctor" element={<DoctorHome />} />
            <Route path="/patient" element={<PatientHome />} />
            <Route path="/admin" element={<AdminHome />} />
            <Route path="/room/:roomId" element={<MeetingRoom />} />
          </Routes>
        </main>

        {/* Debug console (development only) */}
        {process.env.NODE_ENV === 'development' && (
          <DebugSocketStatus />
        )}
      </div>
    </Router>
  );
}

export default App;
```

---

## API Endpoint Reference

**GET** `/consultation/socket-status/`

This endpoint is called automatically by the frontend service. You can also call it directly:

```javascript
// Manual fetch if needed
async function getSocketStatus() {
  const response = await fetch('/consultation/socket-status/');
  const data = await response.json();
  console.log('Socket status:', data);
}
```

---

## Performance Considerations

### Polling Frequency
- **Default**: 10 seconds - Good balance between responsiveness and performance
- **High frequency** (5 seconds): More responsive, slightly higher server load
- **Low frequency** (30+ seconds): Less responsive, minimal server load

### Memory Usage
- Service uses minimal memory (only stores current status)
- Listeners are cleaned up automatically by React hook
- No memory leaks if properly integrated

### Best Practices
1. Initialize service once in App.js
2. Always clean up polling on unmount
3. Use React hook for automatic cleanup
4. Adjust polling frequency based on your needs
5. Monitor network tab to see API calls

---

## Testing

### Manual Testing in Console

```javascript
// Open browser DevTools console

// Check current status
console.log(SocketStatusService.getStatus());

// Get human-readable status
console.log(SocketStatusService.getFormattedStatus());

// Test connection
await SocketStatusService.testConnection().then(result => {
  console.log('Connection test:', result);
});

// Subscribe to updates
const unsub = SocketStatusService.subscribe(status => {
  console.log('Status updated:', status);
});

// Unsubscribe
unsub();
```

---

## Troubleshooting

### Service not updating
- Check that `SocketStatusService.initialize()` was called
- Verify backend API endpoint is working: `GET /consultation/socket-status/`
- Check browser network tab for failed requests
- Check browser console for errors

### High CPU/Network usage
- Reduce polling frequency: `SocketStatusService.initialize(30000)`
- Or increase poll interval: `useSocketStatus(30000)`

### "Connection test failed"
- This is expected if the test endpoint doesn't exist
- The actual WebSocket connections will work fine

---

## File Structure

```
frontend/src/
├── services/
│   └── SocketStatusService.js
├── hooks/
│   └── useSocketStatus.js
├── components/
│   ├── SocketStatusIndicator.js
│   ├── SocketStatusIndicator.css
│   ├── DebugSocketStatus.js
│   └── ErrorBoundary.js
└── App.js
```

---

## Next Steps

1. ✅ Copy the service files to your project
2. ✅ Initialize in App.js
3. ✅ Add status indicator to UI
4. ✅ Test with browser console
5. ✅ Integrate with existing components
6. ✅ Configure polling frequency as needed

For detailed API reference, see [WEBSOCKET_STATUS_SERVICE.md](../WEBSOCKET_STATUS_SERVICE.md)
