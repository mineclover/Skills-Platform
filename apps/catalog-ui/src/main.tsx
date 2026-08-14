import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CatalogApp } from "./CatalogApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CatalogApp />
  </StrictMode>,
);
