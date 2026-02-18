import { redirect } from "next/navigation";

export default async function LegacyShortlistRoute({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  redirect(`/g/${groupId}/custom-list`);
}
