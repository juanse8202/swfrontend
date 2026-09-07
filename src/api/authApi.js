const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/api\/?$/, '');

export async function getCsrfToken() {
  const response = await fetch(`${API_URL}/api/csrf/`, { credentials: 'include' });
  if (!response.ok) throw new Error('No se pudo obtener el token CSRF');
  const data = await response.json();
  return data.csrfToken;
}

async function request(path, body) {
  const csrfToken = await getCsrfToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'La operación no se pudo completar');
  return response.json();
}

export function iniciarSesion(credential, password) {
  const field = credential.includes('@') ? 'email' : 'username';
  return request('/api/login/', { [field]: credential, password });
}
export function registrar(email, password) { return request('/api/registro/', { email, password }); }

export async function cerrarSesion() {
  const csrfToken = await getCsrfToken();
  await fetch(`${API_URL}/api/logout/`, { method: 'POST', credentials: 'include', headers: { 'X-CSRFToken': csrfToken } });
}

export function iniciarOAuth(provider) { window.location.href = `${API_URL}/accounts/${provider}/login/`; }

// Configurable porque el nombre del endpoint de sesión depende del backend Django.
export async function obtenerSesion() {
  const response = await fetch(`${API_URL}${import.meta.env.VITE_SESSION_PATH || '/api/me/'}`, { credentials: 'include' });
  return response.ok ? response.json() : null;
}
