import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PageHero } from "@/components/page-hero";
import { TailorHeroMascot } from "@/components/profile/tailor-hero-mascot";
import { TailorDocxEditor } from "@/components/tailor-docx-editor";
import { authOptions } from "@/lib/auth";
import { buildEditorHtmlFromResume } from "@/lib/editor-document";
import { toSafeGeneration } from "@/lib/generation";
import { Types } from "@/lib/id";
import { connectToDatabase } from "@/lib/db";
import Generation from "@/models/Generation";
import JobDescription from "@/models/JobDescription";
import Resume from "@/models/Resume";

type TailorEditorPageProps = {
  params: Promise<{
    generationId?: string;
  }>;
};

export default async function TailorEditorPage({ params }: TailorEditorPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const { generationId } = await params;

  if (!generationId || !Types.ObjectId.isValid(generationId)) {
    redirect("/retail");
  }

  await connectToDatabase();

  const generation = await Generation.findOne({
    _id: generationId,
    userId: session.user.id,
  }).lean();

  if (!generation) {
    redirect("/retail");
  }

  const [sourceResume, jobDescription] = await Promise.all([
    Resume.findById(generation.sourceResumeId).select("fileName").lean(),
    generation.jobDescriptionId
      ? JobDescription.findById(generation.jobDescriptionId)
          .select("title company")
          .lean()
      : Promise.resolve(null),
  ]);
  const hasBaseEditorHtml =
    Boolean(generation.editorHtml) &&
    (!generation.editorTemplateId || generation.editorTemplateId === "base");
  const initialHtml =
    (hasBaseEditorHtml ? generation.editorHtml : null) ||
    (await buildEditorHtmlFromResume(generation.tailoredData));

  return (
    <div className="hide-app-navbar">
      <PageHero
        volumeLabel="Vol. 05 · tailor editor"
        title="edit tailored resume"
        subtitle="review the generated document, tune the content directly, and export the edited resume as DOCX or PDF."
        mascot={<TailorHeroMascot />}
        activeNavItem="tailor"
      >
        <TailorDocxEditor
          generation={toSafeGeneration(generation, {
            sourceResume: sourceResume
              ? { id: sourceResume._id.toString(), fileName: sourceResume.fileName }
              : null,
            jobDescription: jobDescription
              ? {
                  id: jobDescription._id.toString(),
                  title: jobDescription.title ?? "",
                  company: jobDescription.company ?? "",
                }
              : null,
          })}
          initialHtml={initialHtml}
          hasSavedEditorHtml={hasBaseEditorHtml}
        />
      </PageHero>
    </div>
  );
}
