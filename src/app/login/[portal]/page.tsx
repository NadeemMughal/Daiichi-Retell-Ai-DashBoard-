import { notFound } from "next/navigation";
import { PortalLogin } from "../portal-login";
import type { LoginRole } from "../login-form";

const roleByPortal: Record<string, LoginRole> = { "super-admin": "super_admin", admin: "admin", client: "client" };

export default async function PortalLoginPage({ params }: { params: Promise<{ portal: string }> }) {
  const role = roleByPortal[(await params).portal];
  if (!role) notFound();
  return <PortalLogin role={role}/>;
}
