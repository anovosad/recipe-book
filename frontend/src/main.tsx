import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Enable React strict mode in development
const StrictMode = process.env.NODE_ENV === 'development' ? React.StrictMode : React.Fragment;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);