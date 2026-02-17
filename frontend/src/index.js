import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// StrictMode removed — it double-invokes useEffect in dev mode which unmounts
// the component mid-await, setting video refs to null → srcObject crash
ReactDOM.createRoot(document.getElementById("root")).render(<App />);