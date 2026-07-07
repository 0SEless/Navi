import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Login } from '../pages/Login';
import { AuthContext } from '../hooks/useAuth';
import type { AuthState } from '../types';

function renderLogin(authOverrides?: Partial<AuthState>) {
  const defaultAuth: AuthState = {
    user: null,
    isAuthenticated: false,
    login: vi.fn().mockResolvedValue(true),
    logout: vi.fn(),
  };

  return render(
    <AuthContext.Provider value={{ ...defaultAuth, ...authOverrides }}>
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    </AuthContext.Provider>,
  );
}

describe('Login page', () => {
  it('renders the login form', () => {
    renderLogin();
    expect(screen.getByText('NAVI Admin')).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows error on failed login', async () => {
    const login = vi.fn().mockResolvedValue(false);
    renderLogin({ login });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'bad@email.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('shows loading state while signing in', async () => {
    let resolveLogin: () => void;
    const login = vi.fn().mockReturnValue(new Promise<boolean>((resolve) => {
      resolveLogin = () => resolve(true);
    }));
    renderLogin({ login });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'admin@navi.app');
    await user.type(screen.getByLabelText(/password/i), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    resolveLogin!();
  });
});
