# Task 5: Update login page + delete mock data

**Modify:**
1. `src/components/pages/LoginScreen.tsx` — replace email/password form with Google OAuth button
2. `src/app/(admin)/login/page.tsx` — remove `onLogin` prop, use Google sign-in
3. Delete `src/data/users.ts`
4. Delete `src/data/index.ts`

**Context:** Replace the mock email/password login form with a Google OAuth sign-in button. The mocked data files are no longer needed since mock auth has been removed.

## File 1: `src/components/pages/LoginScreen.tsx`

The LoginScreen component has a beautiful branded UI (gradient background, campus map SVG visualization, NAVI branding) with an email/password login form on the right panel. **Keep all the branding and visual layout**, but replace the form section (lines ~260-421) with a Google OAuth sign-in button.

Changes:
1. Remove the `interface LoginScreenProps` and `onLogin` prop — no longer needed
2. Import `useAuth` and use `signInWithGoogle` instead
3. Replace the email/password form with a "Sign in with Google" button
4. Remove `email`, `password`, `showPassword`, `loading`, `error`, `rememberMe` state

New component signature: `export function LoginScreen()`

The "Sign in with Google" button should:
- Use the same dark gradient styling as the existing login button
- Show a Google logo SVG (simplified — just "G" or Google colors) and "Sign in with Google" text
- Call `signInWithGoogle()` from `useAuth` on click
- Include the same security note below

## File 2: `src/app/(admin)/login/page.tsx`

Remove the `onLogin` prop since LoginScreen no longer needs it.

Old:
```tsx
import { LoginScreen } from "@/components/pages/LoginScreen";

export default function LoginPage() {
  return <LoginScreen onLogin={() => window.location.href = "/admin/dashboard"} />;
}
```

New:
```tsx
import { LoginScreen } from "@/components/pages/LoginScreen";

export default function LoginPage() {
  return <LoginScreen />;
}
```

## File 3: Delete `src/data/users.ts`

Delete the file.

## File 4: Delete `src/data/index.ts`

Delete the file.

## Verification
Run `cmd /c "npm run lint"`.
Expected: 0 errors (pre-existing warnings only). The `LoginScreen` component now uses `signInWithGoogle` which exists on AuthState.

## Dependencies
- `useAuth` from `@/hooks/useAuth` — provides `signInWithGoogle`
- All the visual branding JSX stays the same
