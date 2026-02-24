// src/hooks/useSocketStatus.js
// React Hook for WebSocket Status Service
// Provides convenient access to socket status within React components

import { useEffect, useState } from "react";
import SocketStatusService from "../services/SocketStatusService";

/**
 * Hook to track WebSocket status in React components
 * Automatically subscribes/unsubscribes to status changes
 * 
 * @param {number} pollFrequency - Optional polling frequency in ms (default: 10000)
 * @returns {Object} Socket status object with the following properties:
 *   - active: boolean - whether any socket is active
 *   - totalSockets: number - total count of active sockets
 *   - socketsByType: object - count of sockets by type
 *   - wsUrl: string - WebSocket URL
 *   - apiUrl: string - API URL
 *   - endpoints: object - available WebSocket endpoints
 *   - isConnecting: boolean - whether currently fetching status
 *   - lastError: string|null - last error encountered
 *   - timestamp: string|null - last update timestamp
 * 
 * @example
 * function MyComponent() {
 *   const socketStatus = useSocketStatus();
 *   
 *   return (
 *     <div>
 *       <p>Socket Active: {socketStatus.active ? "✅" : "❌"}</p>
 *       <p>Total Sockets: {socketStatus.totalSockets}</p>
 *     </div>
 *   );
 * }
 */
function useSocketStatus(pollFrequency = 10000) {
  const [status, setStatus] = useState(SocketStatusService.getStatus());
  const [hookId] = useState(() => Math.random().toString(36).slice(2, 9));

  useEffect(() => {
    console.log(`[useSocketStatus:${hookId}] Hook mounted with poll frequency: ${pollFrequency}ms`);

    // Initialize the service with specified poll frequency
    SocketStatusService.initialize(pollFrequency);

    // Subscribe to status changes
    const unsubscribe = SocketStatusService.subscribe((newStatus) => {
      console.log(`[useSocketStatus:${hookId}] Status updated`, {
        active: newStatus.active,
        totalSockets: newStatus.totalSockets,
        socketsByType: newStatus.socketsByType,
      });
      setStatus(newStatus);
    });

    // Cleanup on unmount
    return () => {
      console.log(`[useSocketStatus:${hookId}] Hook unmounted`);
      unsubscribe();
    };
  }, [pollFrequency, hookId]);

  return status;
}

export default useSocketStatus;
