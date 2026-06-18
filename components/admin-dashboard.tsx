"use client";

import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { useMemo, useState } from "react";
import { PageIntro } from "@/components/ui/page-intro";
import { StatusBanner } from "@/components/ui/status-banner";
import { useToast } from "@/components/ui/toast-provider";
import type { SafeArticle } from "@/lib/article";

type MembershipRequestSummary = {
  id: string;
  email: string;
  nickname: string;
  requestDate: string | null;
  requestedTier: string;
  requestReason: string;
};

type AdminDashboardProps = {
  initialRequests: MembershipRequestSummary[];
  initialArticles: SafeArticle[];
};

type MembershipActionResponse = {
  error?: string;
};

type ArticleResponse = {
  error?: string;
  article?: SafeArticle;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

type ArticleFormState = {
  id: string | null;
  title: string;
  slug: string;
  author: string;
  tags: string;
  content: string;
  isPublished: boolean;
};

const emptyArticleForm: ArticleFormState = {
  id: null,
  title: "",
  slug: "",
  author: "Resume Foundry",
  tags: "",
  content: "",
  isPublished: true,
};

export function AdminDashboard({
  initialRequests,
  initialArticles,
}: AdminDashboardProps) {
  const { showErrorToast } = useToast();
  const [requests, setRequests] = useState(initialRequests);
  const [articles, setArticles] = useState(initialArticles);
  const [articleForm, setArticleForm] = useState<ArticleFormState>(emptyArticleForm);
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const sortedArticles = useMemo(
    () =>
      [...articles].sort((left, right) =>
        (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""),
      ),
    [articles],
  );

  const handleMembershipAction = async (
    userId: string,
    action: "approve" | "reject",
  ) => {
    setIsWorking(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/handle-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          action,
        }),
      });

      const payload = (await response.json()) as MembershipActionResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ?? "We couldn't update that membership request.",
        );
      }

      setRequests((currentRequests) =>
        currentRequests.filter((request) => request.id !== userId),
      );
      setStatusMessage({
        tone: "success",
        text:
          action === "approve"
            ? "Membership request approved."
            : "Membership request rejected.",
      });
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "We couldn't update that membership request.",
        {
          title: "Membership review couldn't finish",
        },
      );
    } finally {
      setIsWorking(false);
    }
  };

  const submitArticle = async () => {
    setIsWorking(true);
    setStatusMessage(null);

    try {
      const response = await fetch(
        articleForm.id
          ? `/api/admin/articles/${articleForm.id}`
          : "/api/admin/articles",
        {
          method: articleForm.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(articleForm),
        },
      );

      const payload = (await response.json()) as ArticleResponse;

      if (!response.ok || !payload.article) {
        throw new Error(payload.error ?? "We couldn't save that article.");
      }

      setArticles((currentArticles) => {
        const nextArticles = currentArticles.filter(
          (article) => article.id !== payload.article?.id,
        );

        return [payload.article as SafeArticle, ...nextArticles];
      });
      setArticleForm(emptyArticleForm);
      setStatusMessage({
        tone: "success",
        text: articleForm.id ? "Article updated." : "Article created.",
      });
    } catch (error) {
      showErrorToast(
        error instanceof Error
          ? error.message
          : "We couldn't save that article.",
        {
          title: "Article save couldn't finish",
        },
      );
    } finally {
      setIsWorking(false);
    }
  };

  const loadArticleForEditing = (article: SafeArticle) => {
    setArticleForm({
      id: article.id,
      title: article.title,
      slug: article.slug,
      author: article.author,
      tags: article.tags.join(", "),
      content: article.content,
      isPublished: article.isPublished,
    });
    setStatusMessage(null);
  };

  return (
    <section className="space-y-6">
      <PageIntro
        eyebrow="Admin"
        title="Review upgrades, guide the premium queue, and publish helpful content"
        description="This internal workspace manages membership approvals and the public resource center while keeping the same soft, polished visual language as the rest of the product."
        badge="Overview"
        aside={
          <div className="grid gap-3">
            <div className="soft-stat">
              <p className="eyebrow !text-[0.58rem] !tracking-[0.22em]">Pending requests</p>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {requests.length}
              </p>
            </div>
            <div className="soft-stat">
              <p className="eyebrow !text-[0.58rem] !tracking-[0.22em]">Articles</p>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {articles.length}
              </p>
            </div>
          </div>
        }
      />

      {statusMessage?.tone === "success" ? (
        <StatusBanner tone="success">{statusMessage.text}</StatusBanner>
      ) : null}

      <TabGroup>
        <TabList className="surface-card flex flex-wrap gap-3 rounded-[1.75rem] p-3">
          {["Membership Requests", "Articles"].map((label) => (
            <Tab
              key={label}
              className="rounded-full px-5 py-3 text-sm font-semibold text-muted outline-none data-[selected]:bg-foreground data-[selected]:text-white"
            >
              {label}
            </Tab>
          ))}
        </TabList>

        <TabPanels className="mt-6">
          <TabPanel className="surface-card rounded-[2.2rem] p-6 sm:p-8">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-foreground">
                Pending membership requests
              </h2>
              <p className="text-sm leading-7 text-muted">
                Approve premium access for users who need advanced workflow features.
              </p>

              {requests.length ? (
                <div className="space-y-4">
                  {requests.map((request) => (
                    <article
                      key={request.id}
                      className="dream-card p-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <p className="text-lg font-semibold text-foreground">
                            {request.nickname || request.email}
                          </p>
                          <p className="text-sm text-muted">{request.email}</p>
                          <p className="text-sm text-muted">
                            Requested {request.requestDate
                              ? dateFormatter.format(new Date(request.requestDate))
                              : "recently"}
                          </p>
                          <div className="rounded-2xl border border-line bg-white/72 px-4 py-3 text-sm leading-7 text-muted">
                            {request.requestReason || "No reason provided."}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              void handleMembershipAction(request.id, "approve")
                            }
                            disabled={isWorking}
                            className="button-primary !px-4 !py-3 !text-sm"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleMembershipAction(request.id, "reject")
                            }
                            disabled={isWorking}
                            className="button-secondary !px-4 !py-3 !text-sm"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="dream-card border border-dashed border-line px-6 py-10 text-center">
                  <p className="text-lg font-semibold text-foreground">
                    No pending requests
                  </p>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    Membership approvals will appear here when free users request premium.
                  </p>
                </div>
              )}
            </div>
          </TabPanel>

          <TabPanel className="space-y-6">
            <section className="surface-card rounded-[2.2rem] p-6 sm:p-8">
              <h2 className="text-2xl font-semibold text-foreground">
                Create or update a resource article
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted">
                Articles publish straight to the public resource center using markdown content.
              </p>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-foreground">
                    Title
                  </span>
                  <input
                    type="text"
                    value={articleForm.title}
                    onChange={(event) =>
                      setArticleForm((currentForm) => ({
                        ...currentForm,
                        title: event.target.value,
                      }))
                    }
                    className="input-field"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-foreground">
                    Slug
                  </span>
                  <input
                    type="text"
                    value={articleForm.slug}
                    onChange={(event) =>
                      setArticleForm((currentForm) => ({
                        ...currentForm,
                        slug: event.target.value,
                      }))
                    }
                    className="input-field"
                    placeholder="optional-custom-slug"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-foreground">
                    Author
                  </span>
                  <input
                    type="text"
                    value={articleForm.author}
                    onChange={(event) =>
                      setArticleForm((currentForm) => ({
                        ...currentForm,
                        author: event.target.value,
                      }))
                    }
                    className="input-field"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-foreground">
                    Tags
                  </span>
                  <input
                    type="text"
                    value={articleForm.tags}
                    onChange={(event) =>
                      setArticleForm((currentForm) => ({
                        ...currentForm,
                        tags: event.target.value,
                      }))
                    }
                    className="input-field"
                    placeholder="resume, ats, job-search"
                  />
                </label>
              </div>

              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-semibold text-foreground">
                  Markdown content
                </span>
                <textarea
                  value={articleForm.content}
                  onChange={(event) =>
                    setArticleForm((currentForm) => ({
                      ...currentForm,
                      content: event.target.value,
                    }))
                  }
                  rows={16}
                  className="textarea-field font-mono text-sm"
                />
              </label>

              <label className="mt-5 flex items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={articleForm.isPublished}
                  onChange={(event) =>
                    setArticleForm((currentForm) => ({
                      ...currentForm,
                      isPublished: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-accent"
                />
                Publish immediately
              </label>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void submitArticle()}
                  disabled={
                    isWorking ||
                    !articleForm.title.trim() ||
                    !articleForm.content.trim()
                  }
                  className="button-primary !px-5 !py-3 !text-sm"
                >
                  {isWorking
                    ? "Saving..."
                    : articleForm.id
                      ? "Update Article"
                      : "Create Article"}
                </button>
                {articleForm.id ? (
                  <button
                    type="button"
                    onClick={() => setArticleForm(emptyArticleForm)}
                    className="button-secondary !px-5 !py-3 !text-sm"
                  >
                    Reset Form
                  </button>
                ) : null}
              </div>
            </section>

            <section className="surface-card rounded-[2.2rem] p-6 sm:p-8">
              <h2 className="text-2xl font-semibold text-foreground">
                Existing articles
              </h2>
              <div className="mt-6 space-y-4">
                {sortedArticles.map((article) => (
                  <article
                    key={article.id}
                    className="dream-card p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-lg font-semibold text-foreground">
                            {article.title}
                          </p>
                          <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
                            {article.isPublished ? "Published" : "Draft"}
                          </span>
                        </div>
                        <p className="text-sm text-muted">/{article.slug}</p>
                        <p className="text-sm text-muted">
                          {article.updatedAt
                            ? `Updated ${dateFormatter.format(new Date(article.updatedAt))}`
                            : "Recently updated"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => loadArticleForEditing(article)}
                        className="button-secondary !px-4 !py-3 !text-sm"
                      >
                        Edit Article
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </section>
  );
}
