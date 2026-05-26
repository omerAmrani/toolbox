const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
