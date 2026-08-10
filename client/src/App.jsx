import { Routes, Route } from "react-router-dom";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Results from "./pages/Results";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/game" element={<Game />} />
      <Route path="/results" element={<Results />} />
    </Routes>
  );
}

export default App;
