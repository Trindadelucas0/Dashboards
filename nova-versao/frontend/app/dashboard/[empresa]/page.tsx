import { redirect } from "next/navigation";

export default function Index({ params }: { params: Promise<{ empresa: string }> }) {
  return redirectPlaceholder(params);
}

async function redirectPlaceholder(params: Promise<{ empresa: string }>) {
  const { empresa } = await params;
  redirect(`/dashboard/${empresa}/visao-geral`);
}
