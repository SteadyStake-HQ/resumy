import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { PublicResumeView } from "@/components/public-resume-view";
import { BuniMascot } from "@/components/profile/buni-mascot";
import { toSafeGeneration } from "@/lib/generation";
import { connectToDatabase } from "@/lib/db";
import Generation from "@/models/Generation";

type PublicResumePageProps = {
  params: Promise<{
    publicId: string;
  }>;
};

export async function generateMetadata({
  params,
}: PublicResumePageProps): Promise<Metadata> {
  const { publicId } = await params;

  await connectToDatabase();

  const generation = await Generation.findOne({ publicId })
    .select("tailoredData customization")
    .lean();

  const name =
    generation?.tailoredData &&
    typeof generation.tailoredData === "object" &&
    "personalInfo" in generation.tailoredData &&
    generation.tailoredData.personalInfo &&
    typeof generation.tailoredData.personalInfo === "object" &&
    "name" in generation.tailoredData.personalInfo &&
    typeof generation.tailoredData.personalInfo.name === "string"
      ? generation.tailoredData.personalInfo.name
      : "Public resume";

  return {
    title: `${name} resume`,
    description: "Shared resume view from Resume Foundry.",
  };
}

export default async function PublicResumePage({
  params,
}: PublicResumePageProps) {
  const { publicId } = await params;

  await connectToDatabase();

  const generation = await Generation.findOne({ publicId }).lean();

  if (!generation) {
    return (
      <div
        style={{
          margin: "0 auto",
          maxWidth: 560,
          paddingTop: 48,
          paddingBottom: 48,
        }}
      >
        <div
          style={{
            overflow: "hidden",
            borderRadius: 28,
            border: "1.5px solid #E9D9B8",
            background: "#FFF9EC",
            boxShadow: "0 30px 80px -30px rgba(184,155,232,0.3)",
          }}
        >
          <div
            style={{
              padding: "36px 40px",
              background: "linear-gradient(135deg, #FFD14A, #F4B83C 50%, #F5A490)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-ibm-plex-mono), monospace",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "1.8px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.9)",
              }}
            >
              Resume Foundry · Public Share
            </div>
            <div
              style={{
                marginTop: 14,
                fontFamily: "var(--font-kaisei-tokumin), serif",
                fontSize: "1.85rem",
                fontWeight: 800,
                letterSpacing: "-0.05em",
                color: "#fff",
                lineHeight: 1.1,
              }}
            >
              link unavailable ✦
            </div>
          </div>
          <div
            style={{
              padding: "32px 40px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <BuniMascot size={64} mood="sad" />
            <p style={{ color: "#6B5E4A", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              This public resume link is no longer available or has been removed.
            </p>
            <Link
              href="/"
              style={{
                marginTop: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 22px",
                borderRadius: 999,
                background: "linear-gradient(135deg, #FFD14A, #F5A490)",
                color: "#2F2A1F",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                boxShadow: "0 8px 20px -10px rgba(184,155,232,0.4)",
              }}
            >
              Go to Resume Foundry
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 24, paddingBottom: 48 }}>
      {/* Public branded header */}
      <div
        style={{
          margin: "0 auto 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          maxWidth: "100%",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px 8px 10px",
            borderRadius: 999,
            background: "#FFF9EC",
            border: "1.5px solid #E9D9B8",
            textDecoration: "none",
            boxShadow: "0 4px 12px -8px rgba(184,155,232,0.3)",
          }}
        >
          <Image
            src="/applymate-icon.png"
            alt="Resume Foundry"
            width={800}
            height={800}
            style={{ width: 28, height: 28, objectFit: "contain", borderRadius: "50%" }}
          />
          <span
            style={{
              fontFamily: "var(--font-kaisei-tokumin), serif",
              fontSize: "0.82rem",
              fontWeight: 800,
              color: "#2F2A1F",
              letterSpacing: "-0.02em",
            }}
          >
            Resume Foundry
          </span>
        </Link>

        <div
          style={{
            fontFamily: "var(--font-ibm-plex-mono), monospace",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#9A8752",
            padding: "6px 12px",
            borderRadius: 999,
            background: "#FFF9EC",
            border: "1.5px solid #E9D9B8",
          }}
        >
          Shared resume
        </div>
      </div>

      <PublicResumeView generation={toSafeGeneration(generation)} />
    </div>
  );
}
