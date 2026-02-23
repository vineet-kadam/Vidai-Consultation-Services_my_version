// src/config.js
// Centralized configuration for API endpoints
// Change these values to point to your backend server

const BASE_URL = "192.168.10.191:8000";

export const API_URL = `http://${BASE_URL}`;
export const WS_URL = `ws://${BASE_URL}`;

// For convenience, you can also export the full base URL
const config = {
    API_URL,
    WS_URL,
    BASE_URL,
};

export default config;
