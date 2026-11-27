import { redirect } from "next/navigation";

export default async function SchoolShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const clean = String(code || "").trim().toUpperCase();
  redirect(`/portal?school=${encodeURIComponent(clean)}`);
}
