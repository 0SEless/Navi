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
  login: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => void;
}
