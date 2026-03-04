import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker with update handling
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);

        // When a new SW is installed and waiting, tell it to activate
        // then reload so the new SW + new cache + new HTML are all in sync
        const handleWaitingWorker = (worker: ServiceWorker) => {
          worker.postMessage({ type: 'SKIP_WAITING' });
          // controllerchange fires after the new SW takes over via clients.claim()
        };

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New SW is ready — tell it to activate, reload will happen on controllerchange
                handleWaitingWorker(newWorker);
              }
            });
          }
        });

        // If there's already a waiting worker (e.g. from a previous visit), activate it
        if (registration.waiting) {
          handleWaitingWorker(registration.waiting);
        }

        // Check for updates immediately
        registration.update();
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });

  // Reload once when the new service worker takes control
  // This ensures HTML, JS chunks, and SW cache are all from the same deploy
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) {
      reloading = true;
      window.location.reload();
    }
  });
}
