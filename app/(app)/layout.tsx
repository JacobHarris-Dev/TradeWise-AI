import { AppShell } from "@/components/layout/app-shell";

/**
 * Route group `(app)` does not change URLs — it only shares this layout.
 * All main trading views get the same header, nav, and auth control.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
