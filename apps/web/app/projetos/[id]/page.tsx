import { ProjectWorkspace } from '@/components/projects';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <ProjectWorkspace key={id} id={id} initialTab={tab} />;
}
