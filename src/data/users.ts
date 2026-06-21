import type { User } from '../types';

export const mockUsers: User[] = [
  {
    id: 'u1',
    name: 'Admin User',
    email: 'admin@navi.app',
    role: 'super_admin',
    campus_id: null,
  },
];

export const mockCredentials: Record<string, string> = {
  'admin@navi.app': 'password',
};
