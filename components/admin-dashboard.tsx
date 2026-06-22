"use client";

import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { useMemo, useState } from "react";
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
    <section className="bg-[#fbf8f3] text-[#25221f]">
      <header className="border-b border-[#e8dfd1] px-5 py-8 sm:px-8 lg:px-10">
        <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#6c8f6f]">
              Control room
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
              Review access and publish resources.
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#6c6660]">
              Keep membership reviews moving and maintain the public resource library from one focused workspace.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#ddd2bd] bg-[#ddd2bd] sm:min-w-[22rem]">
            <AdminStat label="Pending" value={requests.length} tone="peach" />
            <AdminStat label="Articles" value={articles.length} tone="sage" />
          </div>
        </div>
      </header>

      {statusMessage?.tone === "success" ? (
        <div className="border-b border-[#e8dfd1] px-5 py-4 sm:px-8 lg:px-10">
          <StatusBanner tone="success">{statusMessage.text}</StatusBanner>
        </div>
      ) : null}

      <TabGroup>
        <div className="border-b border-[#e8dfd1] px-5 py-4 sm:px-8 lg:px-10">
          <TabList className="inline-flex rounded-lg border border-[#ddd2bd] bg-[#f2ece2] p-1">
            <Tab className="rounded-md px-4 py-2.5 text-sm font-bold text-[#6c6660] outline-none data-[selected]:bg-[#25221f] data-[selected]:text-white">
              Membership requests
              <span className="ml-2 font-mono text-[0.65rem] opacity-70">{requests.length}</span>
            </Tab>
            <Tab className="rounded-md px-4 py-2.5 text-sm font-bold text-[#6c6660] outline-none data-[selected]:bg-[#25221f] data-[selected]:text-white">
              Articles
              <span className="ml-2 font-mono text-[0.65rem] opacity-70">{articles.length}</span>
            </Tab>
          </TabList>
        </div>

        <TabPanels>
          <TabPanel className="outline-none">
            <div className="border-b border-[#e8dfd1] px-5 py-6 sm:px-8 lg:px-10">
              <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.13em] text-[#c47752]">
                Review queue
              </p>
              <h3 className="mt-1 font-display text-2xl font-bold">Pending membership requests</h3>
              <p className="mt-2 text-sm leading-6 text-[#6c6660]">
                Review the member context before granting premium access.
              </p>
            </div>

            {requests.length ? (
              <div className="divide-y divide-[#e8dfd1]">
                {requests.map((request) => (
                  <article key={request.id} className="grid gap-5 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(12rem,0.72fr)_minmax(16rem,1.28fr)_auto] lg:items-start lg:px-10">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#fff0e5] font-display text-lg font-bold text-[#c47752]">
                          {(request.nickname || request.email).slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{request.nickname || request.email}</p>
                          <p className="truncate text-xs text-[#968f88]">{request.email}</p>
                        </div>
                      </div>
                      <p className="mt-3 font-mono text-[0.65rem] text-[#968f88]">
                        {request.requestDate
                          ? dateFormatter.format(new Date(request.requestDate))
                          : "Recently submitted"}
                      </p>
                    </div>

                    <div className="rounded-lg border border-[#e1d7c7] bg-white px-4 py-3">
                      <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[#968f88]">
                        Member context
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#514c46]">
                        {request.requestReason || "No reason provided."}
                      </p>
                    </div>

                    <div className="flex gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => void handleMembershipAction(request.id, "approve")}
                        disabled={isWorking}
                        className="min-h-10 rounded-full bg-[#5a7c5d] px-4 text-sm font-bold text-white hover:bg-[#48674b] disabled:opacity-45"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMembershipAction(request.id, "reject")}
                        disabled={isWorking}
                        className="min-h-10 rounded-full border border-[#d9b7a5] bg-white px-4 text-sm font-bold text-[#9b5538] hover:bg-[#fff0e5] disabled:opacity-45"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-16 text-center sm:px-8 lg:px-10">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-[#edf3e9] font-mono text-sm font-bold text-[#5a7c5d]">00</span>
                <h3 className="mt-4 font-display text-xl font-bold">Queue is clear</h3>
                <p className="mt-2 text-sm text-[#6c6660]">New premium requests will appear here.</p>
              </div>
            )}
          </TabPanel>

          <TabPanel className="outline-none">
            <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
              <section className="border-b border-[#e8dfd1] px-5 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
                <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.13em] text-[#6c8f6f]">
                  {articleForm.id ? "Edit article" : "New article"}
                </p>
                <h3 className="mt-1 font-display text-2xl font-bold">
                  {articleForm.id ? "Update resource" : "Create a resource"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#6c6660]">
                  Markdown content publishes directly to the public resource center.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <AdminField label="Title">
                    <input
                      type="text"
                      value={articleForm.title}
                      onChange={(event) => setArticleForm((current) => ({ ...current, title: event.target.value }))}
                      className="admin-paper-input"
                    />
                  </AdminField>
                  <AdminField label="Slug">
                    <input
                      type="text"
                      value={articleForm.slug}
                      onChange={(event) => setArticleForm((current) => ({ ...current, slug: event.target.value }))}
                      className="admin-paper-input"
                      placeholder="optional-custom-slug"
                    />
                  </AdminField>
                  <AdminField label="Author">
                    <input
                      type="text"
                      value={articleForm.author}
                      onChange={(event) => setArticleForm((current) => ({ ...current, author: event.target.value }))}
                      className="admin-paper-input"
                    />
                  </AdminField>
                  <AdminField label="Tags">
                    <input
                      type="text"
                      value={articleForm.tags}
                      onChange={(event) => setArticleForm((current) => ({ ...current, tags: event.target.value }))}
                      className="admin-paper-input"
                      placeholder="resume, ats, job-search"
                    />
                  </AdminField>
                </div>

                <AdminField label="Markdown content" className="mt-4">
                  <textarea
                    value={articleForm.content}
                    onChange={(event) => setArticleForm((current) => ({ ...current, content: event.target.value }))}
                    rows={15}
                    className="admin-paper-input resize-y font-mono text-sm leading-6"
                  />
                </AdminField>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#e8dfd1] pt-5">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={articleForm.isPublished}
                      onChange={(event) => setArticleForm((current) => ({ ...current, isPublished: event.target.checked }))}
                      className="h-4 w-4 accent-[#5a7c5d]"
                    />
                    Publish immediately
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {articleForm.id ? (
                      <button
                        type="button"
                        onClick={() => setArticleForm(emptyArticleForm)}
                        className="min-h-10 rounded-full border border-[#ddd2bd] bg-white px-4 text-sm font-bold hover:bg-[#f2ece2]"
                      >
                        Clear editor
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void submitArticle()}
                      disabled={isWorking || !articleForm.title.trim() || !articleForm.content.trim()}
                      className="min-h-10 rounded-full bg-[#25221f] px-5 text-sm font-bold text-white hover:bg-[#3b3732] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {isWorking ? "Saving..." : articleForm.id ? "Update article" : "Create article"}
                    </button>
                  </div>
                </div>
              </section>

              <aside className="bg-[#f5efe6] px-5 py-7 sm:px-8 lg:px-8">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.13em] text-[#c47752]">Library</p>
                    <h3 className="mt-1 font-display text-2xl font-bold">Existing articles</h3>
                  </div>
                  <span className="font-mono text-xs text-[#968f88]">{articles.length} total</span>
                </div>

                {sortedArticles.length ? (
                  <div className="mt-5 divide-y divide-[#ddd2bd] border-y border-[#ddd2bd]">
                    {sortedArticles.map((article) => (
                      <article key={article.id} className="py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold">{article.title}</p>
                              <span className={`rounded-full px-2 py-1 font-mono text-[0.58rem] font-bold uppercase ${article.isPublished ? "bg-[#d8e6d3] text-[#5a7c5d]" : "bg-[#e7e0f2] text-[#685c7d]"}`}>
                                {article.isPublished ? "Published" : "Draft"}
                              </span>
                            </div>
                            <p className="mt-1 truncate font-mono text-[0.65rem] text-[#968f88]">/{article.slug}</p>
                            <p className="mt-2 text-xs text-[#6c6660]">
                              {article.updatedAt
                                ? `Updated ${dateFormatter.format(new Date(article.updatedAt))}`
                                : "Recently updated"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => loadArticleForEditing(article)}
                            className="shrink-0 rounded-full border border-[#cfc3af] bg-white px-3 py-2 text-xs font-bold hover:bg-[#fbf8f3]"
                          >
                            Edit
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-6 rounded-lg border border-dashed border-[#cfc3af] px-4 py-8 text-center text-sm text-[#6c6660]">
                    No articles have been created yet.
                  </p>
                )}
              </aside>
            </div>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </section>
  );
}

function AdminStat({ label, value, tone }: { label: string; value: number; tone: "sage" | "peach" }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[#968f88]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "sage" ? "text-[#5a7c5d]" : "text-[#c47752]"}`}>{value}</p>
    </div>
  );
}

function AdminField({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-bold">{label}</span>
      {children}
    </label>
  );
}
