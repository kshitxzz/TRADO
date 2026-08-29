import { supabase } from './supabaseClient';

// NOTE: was reading a nonexistent VITE_API_URL, which silently fell back to
// the relative '/api' path — i.e. the Cloudflare frontend domain instead of
// the Render backend. Every other file in the app uses VITE_BACKEND_URL
// (see .env.example) — this now matches that convention.
const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'}/api`;

async function request(url, options = {}) {
  const session = (await supabase.auth.getSession()).data.session;
  const token = session?.access_token;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = 'An error occurred';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (_) {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  get: (url, options) => request(url, { method: 'GET', ...options }),
  post: (url, body, options) => request(url, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: (url, body, options) => request(url, { method: 'PUT', body: JSON.stringify(body), ...options }),
  delete: (url, options) => request(url, { method: 'DELETE', ...options }),
};