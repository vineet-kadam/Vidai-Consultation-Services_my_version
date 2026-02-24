// src/services/SocketStatusService.js
// WebSocket Status Service - provides non-intrusive monitoring of WebSocket connections
// This service helps track socket connectivity status without affecting existing functionality

import { WS_URL, API_URL } from "../config";

class SocketStatusService {
  constructor() {
    this.statusCache = {
      active: false,
      totalSockets: 0,
      socketsByType: {},
      timestamp: null,
      wsUrl: WS_URL,
      apiUrl: API_URL,
      endpoints: {},
      isConnecting: false,
      lastError: null,
    };
    
    this.listeners = new Set();
    this.pollInterval = null;
    this.pollFrequency = 10000; // Poll every 10 seconds
    this.enableLogging = true; // Enable/disable logging
    this.logPrefix = "[SocketStatusService]";
    
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Service initialized`, {
        wsUrl: WS_URL,
        apiUrl: API_URL,
      });
    }
  }

  /**
   * Initialize the service and start polling for socket status
   * @param {number} pollFrequency - Polling interval in milliseconds (default: 10000)
   */
  initialize(pollFrequency = 10000) {
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Initializing with poll frequency: ${pollFrequency}ms`);
    }
    this.pollFrequency = pollFrequency;
    this.startPolling();
  }

  /**
   * Start polling for socket status updates
   */
  startPolling() {
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Starting polling`);
    }
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Fetch immediately
    this.fetchSocketStatus();

    // Then poll at specified interval
    this.pollInterval = setInterval(() => {
      this.fetchSocketStatus();
    }, this.pollFrequency);
    
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Polling started with interval: ${this.pollFrequency}ms`);
    }
  }

  /**
   * Stop polling for socket status
   */
  stopPolling() {
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Stopping polling`);
    }
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Fetch socket status from backend API
   */
  async fetchSocketStatus() {
    try {
      this.statusCache.isConnecting = true;
      this.statusCache.lastError = null;

      if (this.enableLogging) {
        console.log(`${this.logPrefix} Fetching socket status from ${API_URL}/consultation/socket-status/`);
      }

      const response = await fetch(`${API_URL}/consultation/socket-status/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        const prevTotal = this.statusCache.totalSockets;
        const prevActive = this.statusCache.active;
        
        this.statusCache = {
          ...this.statusCache,
          active: data.active || false,
          totalSockets: data.total_sockets || 0,
          socketsByType: data.sockets_by_type || {},
          timestamp: data.timestamp || new Date().toISOString(),
          endpoints: data.ws_endpoints || {},
          isConnecting: false,
        };

        if (this.enableLogging) {
          console.log(`${this.logPrefix} Status fetched successfully`, {
            active: this.statusCache.active,
            totalSockets: this.statusCache.totalSockets,
            socketsByType: this.statusCache.socketsByType,
            prevTotal: prevTotal,
            changed: prevTotal !== this.statusCache.totalSockets || prevActive !== this.statusCache.active,
          });
        }

        // Notify all listeners
        this.notifyListeners();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      this.statusCache.lastError = error.message;
      this.statusCache.isConnecting = false;
      
      console.error(`${this.logPrefix} Fetch error:`, {
        error: error.message,
        url: `${API_URL}/consultation/socket-status/`,
      });
      
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to status changes
   * @param {Function} callback - Function to call when status changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);

    if (this.enableLogging) {
      console.log(`${this.logPrefix} New subscriber added (total: ${this.listeners.size})`);
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
      if (this.enableLogging) {
        console.log(`${this.logPrefix} Subscriber removed (total: ${this.listeners.size})`);
      }
    };
  }

  /**
   * Notify all subscribers of status changes
   */
  notifyListeners() {
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Notifying ${this.listeners.size} listener(s)`, {
        status: this.statusCache.active ? 'active' : 'inactive',
        sockets: this.statusCache.totalSockets,
      });
    }
    
    this.listeners.forEach((callback) => {
      try {
        callback(this.getStatus());
      } catch (error) {
        console.error(`${this.logPrefix} Listener error:`, error);
      }
    });
  }

  /**
   * Get current socket status
   * @returns {Object} Current socket status information
   */
  getStatus() {
    return {
      active: this.statusCache.active,
      totalSockets: this.statusCache.totalSockets,
      socketsByType: this.statusCache.socketsByType,
      timestamp: this.statusCache.timestamp,
      wsUrl: this.statusCache.wsUrl,
      apiUrl: this.statusCache.apiUrl,
      endpoints: this.statusCache.endpoints,
      isConnecting: this.statusCache.isConnecting,
      lastError: this.statusCache.lastError,
    };
  }

  /**
   * Check if any socket is active
   * @returns {boolean} True if any socket is active
   */
  isSocketActive() {
    return this.statusCache.active && this.statusCache.totalSockets > 0;
  }

  /**
   * Get count of active sockets by type
   * @returns {Object} Socket count by type
   */
  getSocketCountByType() {
    return { ...this.statusCache.socketsByType };
  }

  /**
   * Get total number of active sockets
   * @returns {number} Total socket count
   */
  getTotalSocketCount() {
    return this.statusCache.totalSockets;
  }

  /**
   * Get WebSocket URL
   * @returns {string} WebSocket URL
   */
  getWsUrl() {
    return this.statusCache.wsUrl;
  }

  /**
   * Get API URL
   * @returns {string} API URL
   */
  getApiUrl() {
    return this.statusCache.apiUrl;
  }

  /**
   * Get available WebSocket endpoints
   * @returns {Object} Object with all available WebSocket endpoints
   */
  getEndpoints() {
    return { ...this.statusCache.endpoints };
  }

  /**
   * Get last error message
   * @returns {string|null} Last error message or null
   */
  getLastError() {
    return this.statusCache.lastError;
  }

  /**
   * Verify WebSocket connectivity by attempting a test connection
   * Non-blocking, returns a promise
   * @param {string} testPath - Optional specific endpoint to test
   * @returns {Promise<boolean>} True if connection is possible
   */
  async testConnection(testPath = "ws/call/test-socket/") {
    const wsUrl = `${this.statusCache.wsUrl}/${testPath}`;
    
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Testing connection to ${wsUrl}`);
    }
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        if (this.enableLogging) {
          console.warn(`${this.logPrefix} Connection test timeout`);
        }
        resolve(false);
      }, 5000);

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          if (this.enableLogging) {
            console.log(`${this.logPrefix} Connection test successful`);
          }
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          if (this.enableLogging) {
            console.warn(`${this.logPrefix} Connection test failed - WebSocket error`);
          }
          resolve(false);
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          if (this.enableLogging) {
            console.log(`${this.logPrefix} Connection test closed`);
          }
          resolve(false);
        };
      } catch (error) {
        clearTimeout(timeout);
        if (this.enableLogging) {
          console.error(`${this.logPrefix} Connection test exception:`, error);
        }
        resolve(false);
      }
    });
  }

  /**
   * Clear cache and reset status
   */
  clear() {
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Clearing service state`);
    }
    
    this.stopPolling();
    this.statusCache = {
      active: false,
      totalSockets: 0,
      socketsByType: {},
      timestamp: null,
      wsUrl: WS_URL,
      apiUrl: API_URL,
      endpoints: {},
      isConnecting: false,
      lastError: null,
    };
    this.listeners.clear();
    
    if (this.enableLogging) {
      console.log(`${this.logPrefix} Service cleared`);
    }
  }

  /**
   * Get detailed status information as a formatted string (useful for debugging)
   * @returns {string} Formatted status information
   */
  getFormattedStatus() {
    const status = this.getStatus();
    return `
Socket Status Report:
  Active: ${status.active}
  Total Sockets: ${status.totalSockets}
  Sockets by Type: ${JSON.stringify(status.socketsByType)}
  WebSocket URL: ${status.wsUrl}
  API URL: ${status.apiUrl}
  Is Connecting: ${status.isConnecting}
  Last Error: ${status.lastError || "None"}
  Timestamp: ${status.timestamp}
Available Endpoints:
${Object.entries(status.endpoints)
  .map(([key, value]) => `  ${key}: ${value}`)
  .join("\n")}
    `.trim();
  }

  /**
   * Enable or disable logging
   * @param {boolean} enabled - Whether to enable logging
   */
  setLogging(enabled) {
    const prevState = this.enableLogging;
    this.enableLogging = enabled;
    console.log(`${this.logPrefix} Logging ${enabled ? 'enabled' : 'disabled'} (was ${prevState ? 'enabled' : 'disabled'})`);
  }

  /**
   * Get current logging state
   * @returns {boolean} Whether logging is enabled
   */
  isLoggingEnabled() {
    return this.enableLogging;
  }
}

// Export singleton instance
export default new SocketStatusService();
