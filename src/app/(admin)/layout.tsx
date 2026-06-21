"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import type { ScreenName } from "@/types/screens";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (!isAuthenticated && !isLoginPage) {
      router.replace("/admin/login");
    }
  }, [isAuthenticated, isLoginPage, router]);

  if (!isAuthenticated && !isLoginPage) {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  const currentScreen: ScreenName = (segments[segments.length - 1] as ScreenName) || "dashboard";

  const handleNavigate = (screen: ScreenName) => {
    router.push(`/admin/${screen}`);
  };

  return (
    <AppLayout currentScreen={currentScreen} onNavigate={handleNavigate}>
      {children}
    </AppLayout>
  );
}
