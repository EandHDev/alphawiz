import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { GameProvider } from "./context/GameContext";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <GameProvider>
        <App />
      </GameProvider>
    </HashRouter>
  </StrictMode>,
);
