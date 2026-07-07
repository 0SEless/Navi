import { createContext, useContext } from 'react';
import type { AuthState } from '../types';

export const AuthContext = createContext<AuthState>({
  user: null,
  isAuthenticated: false,
  login: async () => false,
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
