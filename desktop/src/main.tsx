import React from "react";
import ReactDOM from "react-dom/client";
import Island from "./island/Island";
import "./index.css";
import "./ui/tokens.css";

document.documentElement.classList.add("island");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Island />
  </React.StrictMode>,
);
