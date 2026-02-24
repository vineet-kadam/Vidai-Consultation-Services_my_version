// src/components/SocketStatusIndicator.js
// Example component showing WebSocket status integration

import React, { useRef, useEffect } from 'react';
import useSocketStatus from '../hooks/useSocketStatus';
import './SocketStatusIndicator.css'; // Optional styling

/**
 * SocketStatusIndicator Component
 * 
 * Displays WebSocket connection status with real-time updates.
 * Shows:
 * - Connection status (Active/Inactive)
 * - Number of active connections
 * - Connection types breakdown
 * - Last update timestamp
 * - Any connection errors
 * 
 * Usage:
 * <SocketStatusIndicator />
 * <SocketStatusIndicator pollFrequency={15000} /> // Custom polling interval
 * <SocketStatusIndicator showDetails={true} /> // Show detailed info
 */
function SocketStatusIndicator({ 
  pollFrequency = 10000, 
  showDetails = false,
  compact = false 
}) {
  const socketStatus = useSocketStatus(pollFrequency);
  const componentIdRef = useRef(Math.random().toString(36).slice(2, 9));
  const logPrefix = `[SocketStatusIndicator:${componentIdRef.current}]`;
  
  const {
    active,
    totalSockets,
    socketsByType,
    wsUrl,
    endpoints,
    isConnecting,
    lastError,
    timestamp
  } = socketStatus;

  useEffect(() => {
    console.log(`${logPrefix} Component mounted`, {
      compact,
      showDetails,
      pollFrequency,
    });

    return () => {
      console.log(`${logPrefix} Component unmounted`);
    };
  }, [logPrefix, compact, showDetails, pollFrequency]);

  useEffect(() => {
    console.log(`${logPrefix} Status changed`, {
      active,
      totalSockets,
      socketsByType,
      lastError,
    });
  }, [logPrefix, active, totalSockets, socketsByType, lastError]);

  // Simple compact indicator
  if (compact) {
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '3px 8px',
        borderRadius: '4px',
        backgroundColor: active ? '#d1fae5' : '#fee2e2',
        fontSize: '12px'
      }}>
        <span style={{ fontSize: '14px' }}>
          {active ? '🟢' : '🔴'}
        </span>
        <span>
          {active ? 'Connected' : 'Disconnected'}
        </span>
        {totalSockets > 0 && (
          <span style={{ color: '#666', fontWeight: 'bold' }}>
            {totalSockets}
          </span>
        )}
      </div>
    );
  }

  // Full indicator with details
  return (
    <div style={{
      padding: '16px',
      backgroundColor: active ? '#f0fdf4' : '#fef2f2',
      border: `2px solid ${active ? '#22c55e' : '#ef4444'}`,
      borderRadius: '8px',
      marginBottom: '16px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <span style={{ fontSize: '20px' }}>
          {active ? '🟢' : '🔴'}
        </span>
        <h3 style={{ margin: 0, color: active ? '#166534' : '#7f1d1d' }}>
          WebSocket Status: {active ? 'Active' : 'Inactive'}
        </h3>
        {isConnecting && (
          <span style={{ fontSize: '12px', color: '#7c3aed' }}>
            🔄 Updating...
          </span>
        )}
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginBottom: '12px'
      }}>
        <div style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: '4px' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
            Total Connections
          </p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: active ? '#22c55e' : '#ef4444' }}>
            {totalSockets}
          </p>
        </div>

        {Object.keys(socketsByType).length > 0 ? (
          <div style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: '4px' }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
              Breakdown
            </p>
            <div style={{ fontSize: '12px' }}>
              {Object.entries(socketsByType).map(([type, count]) => (
                <span key={type} style={{ display: 'block' }}>
                  <strong>{type}:</strong> {count}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: '4px' }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#666' }}>
              No active connections
            </p>
          </div>
        )}
      </div>

      {/* Error Display */}
      {lastError && (
        <div style={{
          padding: '10px',
          backgroundColor: '#fecaca',
          border: '1px solid #fca5a5',
          borderRadius: '4px',
          marginBottom: '12px',
          color: '#991b1b',
          fontSize: '12px'
        }}>
          <strong>⚠️ Error:</strong> {lastError}
        </div>
      )}

      {/* Details Section */}
      {showDetails && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(0,0,0,0.1)'
        }}>
          <details style={{ cursor: 'pointer' }}>
            <summary style={{ fontWeight: 'bold', color: '#666', userSelect: 'none' }}>
              Connection Details
            </summary>
            <div style={{
              marginTop: '8px',
              fontSize: '12px',
              fontFamily: 'monospace',
              backgroundColor: 'rgba(0,0,0,0.03)',
              padding: '8px',
              borderRadius: '4px',
              overflow: 'auto'
            }}>
              <p><strong>WebSocket URL:</strong> {wsUrl}</p>
              <p><strong>Last Update:</strong> {timestamp ? new Date(timestamp).toLocaleTimeString() : 'Never'}</p>
              {Object.keys(endpoints).length > 0 && (
                <div>
                  <p><strong>Available Endpoints:</strong></p>
                  <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                    {Object.entries(endpoints).map(([name, path]) => (
                      <li key={name} style={{ margin: '2px 0' }}>
                        <code>{name}</code>: {path}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export default SocketStatusIndicator;
