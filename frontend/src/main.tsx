import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// StrictMode in development only. import.meta.env, not process.env: the latter
// only works because Vite happens to substitute that one expression.
const StrictMode = import.meta.env.DEV ? React.StrictMode : React.Fragment;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Reveal the app once React has actually painted. index.html used to watch
// #root for a second child instead, which React never produces - it clears the
// container on the first render - so the splash only ever went away on its
// fallback timer, holding every visit on the spinner for two full seconds.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    rootElement.classList.add('loaded');
    document.getElementById('loading-screen')?.setAttribute('hidden', '');
  });
});
