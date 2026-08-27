import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const sections: Record<string, string> = {
  overview: "Overview",
  "voice-agents": "Voice agents",
  calls: "Calls",
  chat: "Chat",
  reports: "Reports",
  "phone-numbers": "Phone Numbers",
  contacts: "Contacts",
  team: "Team"
};

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export default async function PreviewSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const initialView = sections[section];
  if (!initialView) notFound();
  return <DashboardShell preview initialView={initialView} />;
}
