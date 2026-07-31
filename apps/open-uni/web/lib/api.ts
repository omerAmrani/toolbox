const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

// Use for any /api/** call — sends the httpOnly session cookie. On 401
// (not logged in / session expired), redirects to /login.
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: 'include' }).then((res) => {
    if (res.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return res;
  });
}

export async function deleteResource(path: string, confirmMessage: string): Promise<boolean | null> {
  if (!confirm(confirmMessage)) return null;
  const r = await apiFetch(path, { method: 'DELETE' });
  return r.ok;
}
