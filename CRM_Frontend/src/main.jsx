import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Safety fallback: some bundles or external scripts may reference a global
// `pingData` variable. Ensure it's defined to avoid ReferenceError at runtime.
if (typeof window !== 'undefined') {
  window.pingData = window.pingData || {};
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
