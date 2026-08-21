"use client";

import { Suspense } from "react";
import DashboardLayoutInner from "./layout-inner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="notice" style={{ padding: 24 }}>Carregando dashboard…</div>}>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}
