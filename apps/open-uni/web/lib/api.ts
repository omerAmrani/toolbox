const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export async function deleteResource(path: string, confirmMessage: string): Promise<boolean | null> {
  if (!confirm(confirmMessage)) return null;
  const r = await fetch(apiUrl(path), { method: 'DELETE' });
  return r.ok;
}
