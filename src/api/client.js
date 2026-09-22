/**
 * Thin API client for the EchoCode backend.
 *
 * - Base URL from VITE_API_URL (defaults to http://localhost:8000).
 * - Attaches JWT from localStorage when available.
 * - Throws on non-2xx with parsed error detail.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TOKEN_KEY = "echocode_token";

// ── Token management ──────────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Request helpers ───────────────────────────────────────────────────

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const err = await response.json();
      if (err.detail) {
        detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
      }
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    throw new Error(detail);
  }

  // Handle 204 No Content
  if (response.status === 204) return null;

  return response.json();
}

// ── Public API ────────────────────────────────────────────────────────

const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  put: (path, body) => request("PUT", path, body),
};

export default api;
