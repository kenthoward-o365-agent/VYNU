import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Routes are lazy chunks with hashed filenames. After a deploy, a tab holding
// the previous index.html asks for chunk files that no longer exist and the
// screen dies right after an action (classically: just after logging in).
// Vite surfaces that as `vite:preloadError` — reload once to pick up the new
// build; the flag stops a reload loop if the failure is something else.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const KEY = "vynu_chunk_reload";
  if (sessionStorage.getItem(KEY)) return;
  sessionStorage.setItem(KEY, "1");
  window.location.reload();
});
window.addEventListener("load", () => sessionStorage.removeItem("vynu_chunk_reload"));

createRoot(document.getElementById("root")!).render(<App />);
