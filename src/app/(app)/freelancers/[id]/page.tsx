import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { PageHeader, PageShell } from "@/components/page";
import { FreelancerDetailBody } from "../freelancer-sheets";
import { toFreelancerDetail } from "../detail";

export const metadata = { title: "Freelancer" };

// Full-page view of one freelancer: the same details and timeline as the
// side sheet on the Freelance Resource Pool list.
export default async function FreelancerPage({
  params,
}: PageProps<"/freelancers/[id]">) {
  await requirePageRole("HR_ADMIN", "MANAGER");
  const { id } = await params;

  const freelancer = await db.freelancer.findUnique({ where: { id } });
  if (!freelancer) notFound();

  return (
    <PageShell>
      <PageHeader
        title={freelancer.name}
        description={freelancer.skillset}
        actions={
          <Link
            href="/freelancers"
            className="text-sm font-medium underline underline-offset-4"
          >
            Back to list
          </Link>
        }
      />
      <div className="mt-6">
        <FreelancerDetailBody freelancer={toFreelancerDetail(freelancer)} />
      </div>
    </PageShell>
  );
}
