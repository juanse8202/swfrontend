const fallbackApiOrigin = 'http://localhost:8000';

export const apiOriginFrom = (value) => String(value || fallbackApiOrigin)
  .trim()
  .replace(/\/api\/?$/i, '')
  .replace(/\/$/, '');

export const apiBaseUrlFrom = (value) => `${apiOriginFrom(value)}/api`;

export const websocketBaseUrlFrom = (apiUrl, configuredWebSocketUrl) => {
  const candidate = String(configuredWebSocketUrl || apiOriginFrom(apiUrl)).trim().replace(/\/$/, '');
  const socketOrigin = candidate.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  return /\/ws$/i.test(socketOrigin) ? socketOrigin : `${socketOrigin}/ws`;
};
