import {useEffect, useState} from 'react';
import type {User} from 'firebase/auth';
import {ensureAnonymousAuth} from './firebase';

export function useAuthUser(): {user: User | null; error: unknown} {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => ensureAnonymousAuth(setUser, setError), []);

  return {user, error};
}
