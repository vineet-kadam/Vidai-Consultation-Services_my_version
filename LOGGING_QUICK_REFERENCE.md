# Frontend Logging - Quick Reference

## What's Logged?

### SocketStatusService
✅ Service initialization  
✅ Polling start/stop  
✅ Status fetch requests and responses  
✅ Fetch errors with details  
✅ Listener add/remove  
✅ Listener notifications  
✅ Connection tests  
✅ Service cleanup  

### useSocketStatus Hook
✅ Hook mount/unmount (with unique ID)  
✅ Status updates with values  

### SocketStatusIndicator Component
✅ Component mount/unmount (with unique ID)  
✅ Status changes with details  

---

## View Logs

Open browser console: **F12** → **Console** tab

Look for messages starting with:
- `[SocketStatusService]` - Service logs
- `[useSocketStatus:...]` - Hook logs
- `[SocketStatusIndicator:...]` - Component logs

---

## Control Logging

```javascript
// Disable logging
SocketStatusService.setLogging(false);

// Enable logging
SocketStatusService.setLogging(true);

// Check if enabled
SocketStatusService.isLoggingEnabled();
```

---

## Production Setup

```javascript
// Disable in production (App.js)
if (process.env.NODE_ENV === 'production') {
  SocketStatusService.setLogging(false);
}
```

---

## Common Logs to Look For

### Service Starting
```
[SocketStatusService] Service initialized
[SocketStatusService] Polling started with interval: 10000ms
```

### Status Updates
```
[SocketStatusService] Status fetched successfully
  active: true
  totalSockets: 2
  socketsByType: { call: 2 }
```

### Errors
```
[SocketStatusService] Fetch error:
  error: "Network error"
  url: "https://..."
```

### Component Lifecycle
```
[SocketStatusIndicator:a1b2c3d] Component mounted
[SocketStatusIndicator:a1b2c3d] Component unmounted
```

---

## Filter Console Logs

In browser DevTools console, type in filter box:
- `[SocketStatusService]` → Service logs only
- `error` → All error logs
- `fetched` → Fetch success logs
- `unmounted` → Component unmount logs

---

## Key Metrics to Monitor

1. **Polling Frequency**: Should see fetch every N seconds
   ```
   [SocketStatusService] Fetching socket status from...
   [SocketStatusService] Status fetched successfully
   ```

2. **Listener Count**: Should match number of mounted hooks
   ```
   Total subscribers should not keep growing
   ```

3. **Status Changes**: Should show socket count changes
   ```
   [SocketStatusService] Status fetched successfully
     changed: true/false
   ```

4. **Error Rate**: Should be zero in normal operation
   ```
   [SocketStatusService] Fetch error:
   ```

---

## Debugging Example

**Problem**: "Socket status not updating"

**Check logs for**:
1. Service initialization:
   ```
   [SocketStatusService] Service initialized ✓
   ```

2. Polling started:
   ```
   [SocketStatusService] Polling started with interval: 10000ms ✓
   ```

3. Fetches happening:
   ```
   [SocketStatusService] Fetching socket status from... ✓
   [SocketStatusService] Status fetched successfully ✓
   ```

4. Updates reaching components:
   ```
   [SocketStatusIndicator:...] Status changed ✓
   ```

If any step is missing, that's where the issue is.

---

## Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/SocketStatusService.js` | Added logging to all methods |
| `frontend/src/hooks/useSocketStatus.js` | Added mount/unmount and update logging |
| `frontend/src/components/SocketStatusIndicator.js` | Added lifecycle and status change logging |
| `FRONTEND_LOGGING.md` | Complete logging documentation |

---

## Summary

✅ **Comprehensive Logging Added**
- All service methods log their actions
- All hook instances get unique IDs
- All component instances tracked
- Errors logged with context
- Status changes logged with details

✅ **Easy to Control**
- Enable/disable with `setLogging()`
- View in browser console
- Filter by component type

✅ **Production Ready**
- Can be disabled in production
- No performance impact when disabled
- Clear log format

---

For detailed information, see [FRONTEND_LOGGING.md](FRONTEND_LOGGING.md)
