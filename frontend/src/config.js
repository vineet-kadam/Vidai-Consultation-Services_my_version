// src/config.js
// Centralized configuration for API endpoints
// Change these values to point to your backend server

const BASE_URL = "remote-epson-sierra-wood.trycloudflare.com";

export const API_URL = `https://${BASE_URL}/api`;
export const WS_URL = `wss://${BASE_URL}/ws`;

// For convenience, you can also export the full base URL
const config = {
    API_URL,
    WS_URL,
    BASE_URL,
};

export default config;
