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
        
        // Check for updates when the app loads
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content is available, reload to get fresh content
                console.log('New content available, reloading...');
                window.location.reload();
              }
            });
          }
        });
        
        // Listen for service worker messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'CACHE_UPDATED') {
            console.log('Cache updated, reloading page...');
            window.location.reload();
          }
        });
        
        // Check for updates immediately
        registration.update();
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}
