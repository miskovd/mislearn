export interface AuthUser {
  id: number;
  email: string;
  name: string;
  picture: string;
}

export async function fetchCurrentUser() {
  const response = await fetch('/api/auth/me');

  if (!response.ok) {
    throw new Error(`Auth check failed with status ${response.status}`);
  }

  const data = await response.json() as { user: AuthUser | null };
  return data.user;
}

export function startGoogleSignIn() {
  window.location.assign('/api/auth/google');
}

export async function signOut() {
  const response = await fetch('/api/auth/logout', { method: 'POST' });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Sign out failed with status ${response.status}`);
  }
}
