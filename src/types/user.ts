export interface User {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'campus_admin' | 'mapping_staff' | 'viewer';
  campus_id: string | null;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}
