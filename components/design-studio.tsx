"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TailoredResumePreview } from "@/components/tailored-resume-preview";
import { FancySelect } from "@/components/ui/fancy-select";
import { LoadingOrb } from "@/components/ui/loading-orb";
import { PageIntro } from "@/components/ui/page-intro";
import { StatusBanner } from "@/components/ui/status-banner";
import { useToast } from "@/components/ui/toast-provider";
import {
  normalizeResumeCustomization,
  type ResumeCustomization,
  type SafeDesignTemplate,
} from "@/lib/design-template";
import type { SafeGeneration } from "@/lib/generation";

type DesignStudioProps = {
  generation: SafeGeneration;
  templates: SafeDesignTemplate[];
};

type GenerateFilesResponse = {
  error?: string;
  pdfUrl?: string;
  docxUrl?: string;
  generation?: SafeGeneration | null;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const marginSliders: Array<{
  key: keyof ResumeCustomization["margins"];
  label: string;
}> = [
  { key: "top", label: "Top" },
  { key: "right", label: "Right" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
];

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.target = "_blank";
  document.body.append(link);
  link.click();
  link.remove();
}

export function DesignStudio({ generation, templates }: DesignStudioProps) {
  const { showErrorToast } = useToast();
  const initialTemplate =
    templates.find((template) => template.id === generation.designTemplateId) ??
    templates[0] ??
    null;
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialTemplate?.id ?? "",
  );
  const [currentGeneration, setCurrentGeneration] = useState(generation);
  const [generatedFiles, setGeneratedFiles] = useState(generation.generatedFiles);
  const [customization, setCustomization] = useState(() =>
    normalizeResumeCustomization(
      generation.customization,
      initialTemplate?.config ?? null,
    ),
  );
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [activeDownload, setActiveDownload] = useState<"pdf" | "docx" | null>(
    null,
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const deferredCustomization = useDeferredValue(customization);

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }

    setCustomization((currentCustomization) =>
      normalizeResumeCustomization(currentCustomization, selectedTemplate.config),
    );
  }, [selectedTemplate]);

  const previewUrl = useMemo(() => {
    if (!selectedTemplate) {
      return "";
    }

    const params = new URLSearchParams({
      generationId: currentGeneration.id,
      templateId: selectedTemplate.id,
      customization: JSON.stringify(deferredCustomization),
    });

    return `/api/preview?${params.toString()}`;
  }, [currentGeneration.id, deferredCustomization, selectedTemplate]);

  const handleGenerate = async (format: "pdf" | "docx") => {
    if (!selectedTemplate) {
      showErrorToast("Choose a design template before exporting.", {
        title: "Design export couldn't start",
      });
      return;
    }

    setActiveDownload(format);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationId: currentGeneration.id,
          templateId: selectedTemplate.id,
          customization,
        }),
      });

      const payload = (await response.json()) as GenerateFilesResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ?? "We couldn't generate the download files.",
        );
      }

      const nextGeneration = payload.generation ?? null;
      const nextPdfUrl =
        nextGeneration?.generatedFiles.pdfUrl ?? payload.pdfUrl ?? null;
      const nextDocxUrl =
        nextGeneration?.generatedFiles.docxUrl ?? payload.docxUrl ?? null;

      if (nextGeneration) {
        setCurrentGeneration(nextGeneration);
      }

      setGeneratedFiles({
        pdfUrl: nextPdfUrl,
        docxUrl: nextDocxUrl,
      });
      setStatusMessage({
        tone: "success",
        text: "Design saved and export files are ready.",
      });

      const targetUrl = format === "pdf" ? nextPdfUrl : nextDocxUrl;

      if (targetUrl) {
        triggerDownload(
          targetUrl,
          `${selectedTemplate.slug}-${currentGeneration.id}.${format}`,
        );
      }
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "We couldn't generate the download files.",
        {
          title: "Design export couldn't finish",
        },
      );
    } finally {
      setActiveDownload(null);
    }
  };

  if (!templates.length || !selectedTemplate) {
    return (
      <section className="surface-card rounded-[2.2rem] p-8 text-center">
        <p className="eyebrow">Design</p>
        <h1 className="mt-3 font-[var(--font-fraunces)] text-4xl font-semibold tracking-tight text-foreground">
          No active design templates found
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted">
          Seed the built-in templates and reload this page to open the export studio.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Design"
        title="Pick a lovely layout, then export polished recruiter-ready files"
        description="Choose the visual direction, fine-tune typography and spacing, and export PDF or DOCX from the same tailored generation."
        badge="Current generation"
        aside={
          <div className="space-y-2 text-sm text-muted">
            <p className="font-semibold text-foreground">
              {currentGeneration.sourceResume?.fileName ?? "Tailored resume"}
            </p>
            <p>
              {currentGeneration.jobDescription?.title || "Custom job description"}
              {currentGeneration.jobDescription?.company
                ? ` • ${currentGeneration.jobDescription.company}`
                : ""}
            </p>
            <p>
              Saved{" "}
              {currentGeneration.createdAt
                ? dateFormatter.format(new Date(currentGeneration.createdAt))
                : "recently"}
            </p>
          </div>
        }
      />

      {statusMessage?.tone === "success" ? (
        <StatusBanner tone="success">{statusMessage.text}</StatusBanner>
      ) : null}

      <section className="surface-card rounded-[2.2rem] p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <section className="dream-card p-5">
              <p className="eyebrow !text-[0.62rem] !tracking-[0.26em]">Step 1</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Choose a template
              </h2>

              <div className="mt-5 grid gap-4">
                {templates.map((template) => {
                  const isSelected = template.id === selectedTemplateId;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`rounded-[1.5rem] border p-4 text-left ${
                        isSelected
                          ? "border-[color:rgba(101,168,158,0.52)] bg-white shadow-[0_18px_44px_-32px_rgba(71,125,117,0.35)]"
                          : "border-line bg-white/72 hover:bg-white"
                      }`}
                    >
                      <div className="overflow-hidden rounded-[1.2rem] border border-line bg-white">
                        <Image
                          src={template.thumbnailUrl ?? "/template-thumbnails/ats.svg"}
                          alt={`${template.name} preview`}
                          width={640}
                          height={420}
                          className="h-auto w-full"
                        />
                      </div>
                      <div className="mt-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold text-foreground">
                            {template.name}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-muted">
                            {template.description}
                          </p>
                        </div>
                        <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
                          {template.category}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="dream-card p-5">
              <p className="eyebrow !text-[0.62rem] !tracking-[0.26em]">Step 2</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                Customize the look
              </h2>

              <div className="mt-5 grid gap-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-foreground">
                    Font family
                  </span>
                  <FancySelect
                    value={customization.fontFamily}
                    onChange={(nextFontFamily) =>
                      setCustomization((currentCustomization) => ({
                        ...currentCustomization,
                        fontFamily: nextFontFamily,
                      }))
                    }
                    options={selectedTemplate.config.options.fontFamilies.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                </label>

                <div>
                  <span className="mb-2 block text-sm font-semibold text-foreground">
                    Accent color
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {selectedTemplate.config.options.accentColors.map((option) => {
                      const isSelected = customization.accentColor === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setCustomization((currentCustomization) => ({
                              ...currentCustomization,
                              accentColor: option.value,
                            }))
                          }
                          className={`flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold ${
                            isSelected
                              ? "border-foreground bg-white text-foreground"
                              : "border-line bg-background/70 text-muted hover:bg-white"
                          }`}
                        >
                          <span
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: option.value }}
                          />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {marginSliders.map((slider) => (
                    <label key={slider.key} className="block">
                      <span className="mb-2 block text-sm font-semibold text-foreground">
                        {slider.label} margin
                      </span>
                      <input
                        type="range"
                        min={selectedTemplate.config.options.marginRange.min}
                        max={selectedTemplate.config.options.marginRange.max}
                        step={selectedTemplate.config.options.marginRange.step}
                        value={customization.margins[slider.key]}
                        onChange={(event) =>
                          setCustomization((currentCustomization) => ({
                            ...currentCustomization,
                            margins: {
                              ...currentCustomization.margins,
                              [slider.key]: Number.parseFloat(event.target.value),
                            },
                          }))
                        }
                      className="w-full accent-accent"
                      />
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                        {customization.margins[slider.key].toFixed(2)} in
                      </p>
                    </label>
                  ))}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-foreground">
                      Bullet style
                    </span>
                    <FancySelect
                      value={customization.bulletStyle}
                      onChange={(nextBulletStyle) =>
                        setCustomization((currentCustomization) => ({
                          ...currentCustomization,
                          bulletStyle:
                            nextBulletStyle as ResumeCustomization["bulletStyle"],
                        }))
                      }
                      options={selectedTemplate.config.options.bulletStyles.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-foreground">
                      Page density
                    </span>
                    <FancySelect
                      value={customization.pageDensity}
                      onChange={(nextPageDensity) =>
                        setCustomization((currentCustomization) => ({
                          ...currentCustomization,
                          pageDensity:
                            nextPageDensity as ResumeCustomization["pageDensity"],
                        }))
                      }
                      options={selectedTemplate.config.options.pageDensity.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                  </label>
                </div>
              </div>
            </section>
          </div>

          <section className="dream-card p-5">
            <p className="eyebrow !text-[0.62rem] !tracking-[0.26em]">Step 3</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              Preview and download
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              The preview updates from the same renderer used for the final PDF.
              Export once and we&apos;ll save the chosen design back to history.
            </p>

            <div className="mt-6 aspect-[210/297] overflow-hidden rounded-[1.75rem] border border-line bg-background shadow-[0_18px_40px_-28px_rgba(23,48,39,0.35)]">
              {previewUrl ? (
                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  title={`${selectedTemplate.name} preview`}
                  className="h-full w-full bg-white"
                />
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleGenerate("pdf")}
                disabled={activeDownload !== null}
                className="button-primary !px-5 !py-3 !text-sm"
              >
                {activeDownload === "pdf" ? "Generating PDF..." : "Download PDF"}
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate("docx")}
                disabled={activeDownload !== null}
                className="button-secondary !px-5 !py-3 !text-sm"
              >
                {activeDownload === "docx" ? "Generating DOCX..." : "Download DOCX"}
              </button>
              <Link
                href="/history"
                className="button-secondary !px-5 !py-3 !text-sm"
              >
                View History
              </Link>
            </div>

            {activeDownload ? (
              <div className="mt-4">
                <LoadingOrb
                  label={`Generating your ${activeDownload.toUpperCase()} export...`}
                />
              </div>
            ) : null}

            {generatedFiles.pdfUrl || generatedFiles.docxUrl ? (
              <div className="mt-6 rounded-[1.5rem] border border-line bg-white/72 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Latest exported files
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {generatedFiles.pdfUrl ? (
                    <a
                      href={generatedFiles.pdfUrl}
                      download
                      className="button-secondary !px-4 !py-2.5 !text-sm"
                    >
                      Open PDF
                    </a>
                  ) : null}
                  {generatedFiles.docxUrl ? (
                    <a
                      href={generatedFiles.docxUrl}
                      download
                      className="button-secondary !px-4 !py-2.5 !text-sm"
                    >
                      Open DOCX
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </section>

      <TailoredResumePreview
        data={currentGeneration.tailoredData}
        title="Tailored resume content"
        subtitle="This is the structured content feeding the selected design template."
      />
    </div>
  );
}
