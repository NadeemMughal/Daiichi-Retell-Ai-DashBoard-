import { SetupScreen } from "@/components/setup-screen";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export default async function HomePage() {
  if (!isSupabaseConfigured()) return <SetupScreen />;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const admin = createAdminClient();
  const { data: platformRole } = await admin.from("platform_role_assignments").select("id").eq("user_id", userData.user.id).is("revoked_at", null).limit(1).maybeSingle();
  if (platformRole) redirect("/admin/dashboard");
  const { data: membership } = await supabase.from("tenant_memberships").select("tenants(slug)").eq("user_id", userData.user.id).eq("status", "active").limit(1).maybeSingle();
  const tenant = Array.isArray(membership?.tenants) ? membership.tenants[0] : membership?.tenants;
  if (tenant?.slug) redirect(`/${tenant.slug}/overview`);
  redirect("/onboarding");
}
