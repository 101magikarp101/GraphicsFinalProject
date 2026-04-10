/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App.tsx";
import { GameApiProvider } from "./api.js";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

render(
  () => (
    <GameApiProvider>
      <App />
    </GameApiProvider>
  ),
  root,
);
