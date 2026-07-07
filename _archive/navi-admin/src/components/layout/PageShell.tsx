import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface PageShellProps {
  children: ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="ml-64">
        <TopBar />
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
