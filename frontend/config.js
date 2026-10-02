// After deploying the backend on Render, replace with your Render URL (no trailing slash).
window.API_BASE = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://gravity-slingshot.onrender.com';
