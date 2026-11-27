import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ConfirmationProvider } from "./ui/Confirmation";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfirmationProvider>
      <App />
    </ConfirmationProvider>
  </React.StrictMode>
);
