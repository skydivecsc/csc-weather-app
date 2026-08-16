import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import WeatherProvier from "./context/WeatherContext";
import LoadProvider from "./context/LoadContext.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <WeatherProvier>
      <LoadProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LoadProvider>
    </WeatherProvier>
  </StrictMode>
);
