import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
  if (profile?.status !== "active") return NextResponse.json({ error: "ACCOUNT_INACTIVE" }, { status: 403 });
  const { data: roles } = await admin.from("platform_role_assignments").select("role").eq("user_id", data.user.id).is("scope_tenant_id", null).is("revoked_at", null);
  if ((roles ?? []).some(({ role }) => role === "super_admin")) return NextResponse.json({ role: "super_admin", landing: "/admin/dashboard" });
  if (roles?.length) return NextResponse.json({ role: "admin", landing: "/admin/dashboard" });
  const { data: membership } = await admin.from("tenant_memberships").select("tenants(slug)").eq("user_id", data.user.id).eq("status", "active").limit(1).maybeSingle();
  const tenant = Array.isArray(membership?.tenants) ? membership.tenants[0] : membership?.tenants;
  if (tenant?.slug) return NextResponse.json({ role: "client", landing: `/${tenant.slug}/overview` });
  return NextResponse.json({ error: "NO_ACTIVE_PORTAL" }, { status: 403 });
}
