"use client";

import Draggable from "react-draggable";
import type { DraggableData, DraggableEvent } from "react-draggable";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { BuniMascot } from "@/components/profile/buni-mascot";
import { GeminiSettings } from "@/components/gemini-settings";
import { useToast } from "@/components/ui/toast-provider";
import {
  GEMINI_ROUTER_REFRESH_EVENT,
  HUGGINGFACE_ROUTER_REFRESH_EVENT,
} from "@/lib/client-api";
import { PROFILE_THEME as PROF } from "@/lib/profile-theme";

type RouterStatus =
  | "configured"
  | "available"
  | "invalid"
  | "limited"
  | "error";

type RouterHealth = {
  index: number;
  name: string;
  envName: string;
  isDefault: boolean;
  isSelected: boolean;
  model: string;
  status: RouterStatus;
  detail: string;
  checkedAt: string | null;
  quota: {
    remainingRequests: string | null;
    remainingTokens: string | null;
    limitRequests?: string | null;
    limitTokens?: string | null;
    remainingDailyRequests?: string | null;
    limitDailyRequests?: string | null;
    reset: string | null;
    resetAt: string | null;
  } | null;
};

type GeminiRouterControlProps = {
  canValidateKeys: boolean;
  initialRouters: RouterHealth[];
  initialSelectedRouterIndex: number;
};

type SharedRouterControlProps = GeminiRouterControlProps & {
  endpoint: string;
  refreshEvent: string;
  providerLabel: string;
  panelDataId: string;
  settingsSlot?: ReactNode;
};

type PanelPosition = { x: number; y: number };

type DraggableRouterSheetProps = {
  children: ReactNode;
  isDragging: boolean;
  isMinimized: boolean;
  sheetRef: MutableRefObject<HTMLDivElement | null>;
  transform?: string | null;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

const STATUS_COPY: Record<RouterStatus, string> = {
  configured: "Not checked",
  available: "Available",
  invalid: "Invalid",
  limited: "Limited",
  error: "Error",
};

const DOT_CLASSES: Record<RouterStatus, string> = {
  configured: "bg-muted/45",
  available: "bg-emerald-500",
  invalid: "bg-rose-500",
  limited: "bg-amber-500",
  error: "bg-rose-500",
};

const ROUTER_UI = {
  bg: PROF.bg,
  surface: PROF.surface,
  surfaceSoft: PROF.surfaceSoft,
  ink: PROF.ink,
  inkSoft: PROF.inkSoft,
  inkMute: PROF.inkMute,
  line: PROF.line,
  running: {
    bg: PROF.actionBg,
    edge: PROF.actionEdge,
    ink: PROF.actionInk,
    dot: PROF.actionDot,
  },
  pending: {
    bg: PROF.pendingBg,
    edge: PROF.pendingEdge,
    ink: PROF.pendingInk,
    dot: PROF.pendingDot,
  },
  failed: {
    bg: PROF.dangerBg,
    edge: PROF.dangerEdge,
    ink: PROF.dangerInk,
    dot: PROF.dangerDot,
  },
  completed: {
    bg: PROF.completedBg,
    edge: PROF.completedEdge,
    ink: PROF.completedInk,
    dot: PROF.completedDot,
  },
  accent: PROF.accent,
  accent2: PROF.accent2,
  accent3: PROF.accent3,
} as const;
const PANEL_MARGIN = 12;
const PANEL_TOP = 112;
const PANEL_WIDTH = 416;
const MINIMIZED_PANEL_WIDTH = 352;
const PANEL_FALLBACK_HEIGHT = 480;
const MINIMIZED_PANEL_FALLBACK_HEIGHT = 320;

function getFallbackPanelSize(isMinimized = false) {
  const targetWidth = isMinimized ? MINIMIZED_PANEL_WIDTH : PANEL_WIDTH;
  const targetHeight = isMinimized
    ? MINIMIZED_PANEL_FALLBACK_HEIGHT
    : PANEL_FALLBACK_HEIGHT;
  const viewportWidth = Math.max(PANEL_MARGIN * 2, window.innerWidth);
  const viewportHeight = Math.max(PANEL_MARGIN * 2, window.innerHeight);

  return {
    width: Math.max(0, Math.min(targetWidth, viewportWidth - PANEL_MARGIN * 2)),
    height: Math.max(
      0,
      Math.min(targetHeight, viewportHeight - PANEL_MARGIN * 2),
    ),
  };
}

function getPanelBounds(size: { width: number; height: number }) {
  return {
    left: PANEL_MARGIN,
    top: PANEL_MARGIN,
    right: Math.max(
      PANEL_MARGIN,
      window.innerWidth - size.width - PANEL_MARGIN,
    ),
    bottom: Math.max(
      PANEL_MARGIN,
      window.innerHeight - size.height - PANEL_MARGIN,
    ),
  };
}

function getMinimizedPanelBounds(size: { width: number; height: number }) {
  return getPanelBounds(size);
}

function clampPanelPosition(
  position: PanelPosition,
  bounds: ReturnType<typeof getPanelBounds>,
) {
  return {
    x: Math.min(Math.max(bounds.left, position.x), bounds.right),
    y: Math.min(Math.max(bounds.top, position.y), bounds.bottom),
  };
}

function getDefaultPanelPosition(
  bounds: ReturnType<typeof getPanelBounds>,
  isMinimized = false,
) {
  return clampPanelPosition(
    isMinimized
      ? {
          x: bounds.right,
          y: bounds.top,
        }
      : {
          x: bounds.left + (bounds.right - bounds.left) / 2,
          y: Math.min(PANEL_TOP, bounds.bottom),
        },
    bounds,
  );
}

export function GeminiRouterControl(props: GeminiRouterControlProps) {
  return (
    <SharedRouterControl
      {...props}
      endpoint="/api/ai-routers"
      refreshEvent={GEMINI_ROUTER_REFRESH_EVENT}
      providerLabel="Gemini"
      panelDataId="gemini-router-panel"
      settingsSlot={<GeminiSettings />}
    />
  );
}

export function HuggingFaceRouterControl(props: GeminiRouterControlProps) {
  return (
    <SharedRouterControl
      {...props}
      endpoint="/api/huggingface-routers"
      refreshEvent={HUGGINGFACE_ROUTER_REFRESH_EVENT}
      providerLabel="Hugging Face"
      panelDataId="huggingface-router-panel"
    />
  );
}

function parseQuotaValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const numericValue = Number.parseFloat(value.replace(/,/g, ""));

  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatCompactNumber(value: number | null) {
  if (value === null) {
    return "--";
  }

  if (value >= 1_000_000) {
    return `${Number.parseFloat((value / 1_000_000).toFixed(1))}M`;
  }

  if (value >= 1_000) {
    return `${Number.parseFloat((value / 1_000).toFixed(1))}K`;
  }

  return String(Math.max(0, Math.round(value)));
}

function getQuotaMetric(
  remainingValue: string | null | undefined,
  limitValue: string | null | undefined,
) {
  const limit = parseQuotaValue(limitValue);
  const remaining = parseQuotaValue(remainingValue);

  if (remaining === null && limit === null) {
    return null;
  }

  if (limit === null) {
    return {
      used: null,
      limit: remaining,
      percent: 0,
    };
  }

  const used = remaining === null ? 0 : Math.max(0, limit - remaining);
  const percent =
    limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;

  return {
    used,
    limit,
    percent,
  };
}

function getQuotaMetrics(router: RouterHealth) {
  const quota = router.quota;

  return [
    {
      label: "RPM",
      metric: getQuotaMetric(quota?.remainingRequests, quota?.limitRequests),
    },
    {
      label: "TPM",
      metric: getQuotaMetric(quota?.remainingTokens, quota?.limitTokens),
    },
    {
      label: "RPD",
      metric: getQuotaMetric(
        quota?.remainingDailyRequests,
        quota?.limitDailyRequests,
      ),
    },
  ].flatMap((entry) =>
    entry.metric ? [{ label: entry.label, ...entry.metric }] : [],
  );
}

function getRouterBadge(router: RouterHealth, selectedRouterIndex: number) {
  if (router.index === selectedRouterIndex) {
    return {
      label: "Using",
      style: {
        border: `1px solid ${ROUTER_UI.running.edge}`,
        background: ROUTER_UI.running.bg,
        color: ROUTER_UI.running.ink,
      },
    };
  }

  const theme =
    router.status === "available"
      ? ROUTER_UI.running
      : router.status === "limited"
        ? ROUTER_UI.pending
        : router.status === "invalid" || router.status === "error"
          ? ROUTER_UI.failed
          : {
              bg: ROUTER_UI.surface,
              edge: ROUTER_UI.line,
              ink: ROUTER_UI.inkSoft,
            };

  return {
    label: STATUS_COPY[router.status],
    style: {
      border: `1px solid ${theme.edge}`,
      background: theme.bg,
      color: theme.ink,
    },
  };
}

function getRouterTheme(status: RouterStatus, isSelected = false) {
  if (isSelected) {
    return ROUTER_UI.completed;
  }

  if (status === "available") {
    return ROUTER_UI.running;
  }

  if (status === "limited") {
    return ROUTER_UI.pending;
  }

  if (status === "invalid" || status === "error") {
    return ROUTER_UI.failed;
  }

  return {
    bg: ROUTER_UI.surface,
    edge: ROUTER_UI.line,
    ink: ROUTER_UI.inkSoft,
    dot: ROUTER_UI.inkMute,
  };
}

function RouterStatusIcon({
  status,
  isSelected,
  size = 22,
}: {
  status: RouterStatus;
  isSelected?: boolean;
  size?: number;
}) {
  const theme = getRouterTheme(status, isSelected);
  const common = {
    width: size,
    height: size,
    borderRadius: 999,
    background: theme.bg,
    border: `1.5px solid ${theme.edge}`,
    display: "grid",
    placeItems: "center",
  } as const;

  if (isSelected || status === "available") {
    return (
      <div style={{ ...common, boxShadow: `0 0 0 3px ${theme.bg}55` }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: theme.dot,
            boxShadow: `0 0 0 3px ${theme.dot}33`,
            animation: "routerQueuePulse 1.3s ease-in-out infinite",
          }}
        />
      </div>
    );
  }

  if (status === "limited" || status === "configured") {
    return (
      <div style={common}>
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="9" stroke={theme.ink} strokeWidth="2.2" />
          <path
            d="M12 7 V12 L15.5 14"
            stroke={theme.ink}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div style={common}>
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M7 7 L17 17 M17 7 L7 17"
          stroke={theme.ink}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function RouterCountChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: ReturnType<typeof getRouterTheme>;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px 6px 8px",
        borderRadius: 999,
        background: tone.bg,
        border: `1.5px solid ${tone.edge}`,
        color: tone.ink,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.1,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          border: `1px solid ${tone.edge}`,
          background: "#fff8",
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {count}
      </div>
      <span>{label}</span>
    </div>
  );
}

function RouterFooterButton({
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  tone?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        border: `1.5px solid ${tone === "accent" ? ROUTER_UI.pending.edge : ROUTER_UI.line}`,
        background:
          tone === "accent" ? ROUTER_UI.pending.bg : ROUTER_UI.surface,
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        color: tone === "accent" ? ROUTER_UI.pending.ink : ROUTER_UI.ink,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s",
        opacity: disabled ? 0.55 : 1,
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function RouterRow({
  router,
  selectedRouterIndex,
  isLoading,
  isChecking,
  onCheck,
  onSelect,
}: {
  router: RouterHealth;
  selectedRouterIndex: number;
  isLoading: boolean;
  isChecking: boolean;
  onCheck: () => void;
  onSelect: () => void;
}) {
  const isSelected = router.index === selectedRouterIndex;
  const theme = getRouterTheme(router.status, isSelected);
  const badge = getRouterBadge(router, selectedRouterIndex);
  const quotaMetrics = getQuotaMetrics(router);

  return (
    <div
      style={{
        background: ROUTER_UI.surface,
        border: `1.5px solid ${theme.edge}`,
        borderRadius: 16,
        padding: "12px 12px 12px 14px",
        boxShadow: `0 2px 0 ${theme.edge}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: theme.dot,
          opacity: 0.5,
        }}
      />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ paddingTop: 2 }}>
          <RouterStatusIcon
            status={router.status}
            isSelected={isSelected}
            size={24}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: theme.ink,
                  background: theme.bg,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${theme.edge}`,
                  flexShrink: 0,
                }}
              >
                {badge.label}
              </span>
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: ROUTER_UI.ink,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {router.name}
              </span>
              {router.isDefault && !isSelected ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: ROUTER_UI.inkSoft,
                    background: ROUTER_UI.surfaceSoft,
                    padding: "2px 8px",
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  default
                </span>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={onCheck}
                disabled={isChecking || isLoading}
                style={{
                  border: `1px solid ${ROUTER_UI.line}`,
                  background: ROUTER_UI.surface,
                  color: ROUTER_UI.ink,
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: isChecking || isLoading ? "not-allowed" : "pointer",
                  opacity: isChecking || isLoading ? 0.55 : 1,
                }}
              >
                {isChecking ? "Checking" : "Check"}
              </button>
              <button
                type="button"
                onClick={onSelect}
                disabled={isSelected || isChecking || isLoading}
                style={{
                  border: `1px solid ${isSelected ? ROUTER_UI.running.edge : ROUTER_UI.accent2}`,
                  background: isSelected
                    ? ROUTER_UI.running.bg
                    : ROUTER_UI.accent2,
                  color: isSelected ? ROUTER_UI.running.ink : "#fff",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor:
                    isSelected || isChecking || isLoading
                      ? "not-allowed"
                      : "pointer",
                  opacity: isSelected || isChecking || isLoading ? 0.7 : 1,
                }}
              >
                {isSelected ? "Using" : "Use"}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              fontSize: 11,
              color: ROUTER_UI.inkSoft,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              minWidth: 0,
              flexWrap: "nowrap",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            <span style={{ flexShrink: 0 }}>R{router.index}</span>
            <span style={{ opacity: 0.5, flexShrink: 0 }}>·</span>
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: theme.ink,
              }}
            >
              {router.detail || router.model}
            </span>
          </div>

          {quotaMetrics.length ? (
            <div
              style={{
                display: "grid",
                gap: 8,
                marginTop: 10,
                gridTemplateColumns:
                  quotaMetrics.length === 1
                    ? "1fr"
                    : quotaMetrics.length === 2
                      ? "1fr 1fr"
                      : "1fr 1fr 1fr",
              }}
            >
              {quotaMetrics.map((metric) => (
                <div key={metric.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 10.5,
                      color: ROUTER_UI.inkSoft,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    }}
                  >
                    <span>{metric.label}</span>
                    <span style={{ color: ROUTER_UI.ink, fontWeight: 700 }}>
                      {metric.used === null
                        ? formatCompactNumber(metric.limit)
                        : `${formatCompactNumber(metric.used)} / ${formatCompactNumber(metric.limit)}`}
                    </span>
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 8,
                      borderRadius: 999,
                      background: `${theme.edge}55`,
                      overflow: "hidden",
                      position: "relative",
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(4, Math.min(100, metric.percent))}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${ROUTER_UI.accent2}, ${ROUTER_UI.accent})`,
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background:
                            "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
                          animation: "routerQueueShimmer 1.6s linear infinite",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DraggableRouterSheet({
  children,
  className,
  isDragging,
  isMinimized,
  sheetRef,
  style: draggableStyle,
  transform: _transform,
  ...draggableProps
}: DraggableRouterSheetProps) {
  void isDragging;
  void _transform;

  const setSheetNode = useCallback(
    (node: HTMLDivElement | null) => {
      sheetRef.current = node;
    },
    [sheetRef],
  );

  return (
    <div
      ref={setSheetNode}
      {...draggableProps}
      className={`${className ?? ""} pointer-events-auto flex max-h-[calc(100vh-1.5rem)] flex-col p-0 ${
        isMinimized
          ? "absolute left-0 top-0 min-h-48 min-w-72 resize overflow-auto w-[min(22rem,calc(100vw-1.5rem))]"
          : "absolute left-0 top-0 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden"
      }`}
      style={{
        ...(draggableStyle ?? {}),
        borderRadius: 24,
        background: `linear-gradient(180deg, ${ROUTER_UI.surfaceSoft} 0%, ${ROUTER_UI.bg} 100%)`,
        boxShadow:
          "-20px 0 50px -20px rgba(184,155,232,0.2), 0 24px 60px -28px rgba(46,38,64,0.28)",
        color: ROUTER_UI.ink,
      }}
    >
      {children}
    </div>
  );
}

function SharedRouterControl({
  canValidateKeys,
  endpoint,
  initialRouters,
  initialSelectedRouterIndex,
  panelDataId,
  providerLabel,
  refreshEvent,
  settingsSlot,
}: SharedRouterControlProps) {
  const { showToast } = useToast();
  const [routers, setRouters] = useState(initialRouters);
  const [selectedRouterIndex, setSelectedRouterIndex] = useState(
    initialSelectedRouterIndex,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingRouter, setCheckingRouter] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "available" | "attention" | "using"
  >("all");
  const [position, setPosition] = useState<PanelPosition>({
    x: PANEL_MARGIN,
    y: PANEL_TOP,
  });
  const [dragBounds, setDragBounds] = useState(() =>
    typeof window === "undefined"
      ? {
          left: PANEL_MARGIN,
          top: PANEL_MARGIN,
          right: PANEL_WIDTH,
          bottom: PANEL_FALLBACK_HEIGHT,
        }
      : getPanelBounds(getFallbackPanelSize()),
  );
  const sheetRef = useRef<HTMLDivElement>(null);
  const lastWarningKeyRef = useRef("");

  const defaultRouter =
    routers.find((router) => router.index === selectedRouterIndex) ??
    routers.find((router) => router.isSelected) ??
    routers[0] ??
    null;
  const badgeStatus = defaultRouter?.status ?? "error";
  const counts = routers.reduce(
    (accumulator, router) => {
      accumulator.total += 1;
      if (router.index === selectedRouterIndex) {
        accumulator.using += 1;
      }
      if (router.status === "available") {
        accumulator.available += 1;
      } else if (
        router.status === "limited" ||
        router.status === "configured"
      ) {
        accumulator.attention += 1;
      } else if (router.status === "invalid" || router.status === "error") {
        accumulator.failed += 1;
        accumulator.attention += 1;
      }
      return accumulator;
    },
    {
      total: 0,
      using: 0,
      available: 0,
      attention: 0,
      failed: 0,
    },
  );

  const mood =
    counts.failed > 0
      ? "sad"
      : counts.available > 0
        ? "working"
        : counts.using > 0
          ? "happy"
          : "idle";

  const filteredRouters = routers.filter((router) => {
    if (filter === "all") {
      return true;
    }
    if (filter === "using") {
      return router.index === selectedRouterIndex;
    }
    if (filter === "available") {
      return router.status === "available";
    }
    return ["limited", "configured", "invalid", "error"].includes(
      router.status,
    );
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleOutsidePointerDown = (event: globalThis.PointerEvent) => {
      const sheet = sheetRef.current;

      if (isMinimized || !sheet || sheet.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handleOutsidePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [isMinimized, isOpen]);

  const warnAboutSelectedRouter = useCallback(
    (nextRouters: RouterHealth[], nextSelectedRouterIndex: number) => {
      const selectedRouter =
        nextRouters.find(
          (router) => router.index === nextSelectedRouterIndex,
        ) ?? nextRouters.find((router) => router.isSelected);

      if (
        !selectedRouter ||
        !["invalid", "limited", "error"].includes(selectedRouter.status) ||
        !selectedRouter.checkedAt
      ) {
        return;
      }

      const warningKey = `${selectedRouter.index}:${selectedRouter.status}:${selectedRouter.checkedAt}`;

      if (lastWarningKeyRef.current === warningKey) {
        return;
      }

      lastWarningKeyRef.current = warningKey;
      const hasAvailableRouter = nextRouters.some(
        (router) =>
          router.index !== selectedRouter.index &&
          router.status === "available",
      );

      showToast({
        tone: selectedRouter.status === "limited" ? "info" : "error",
        title: "Router needs attention",
        message: hasAvailableRouter
          ? `${selectedRouter.name} is ${STATUS_COPY[selectedRouter.status].toLowerCase()}. Select an available router before your next ${providerLabel} request.`
          : `${selectedRouter.name} is ${STATUS_COPY[selectedRouter.status].toLowerCase()}. Check your ${providerLabel} router setup before the next request.`,
        durationMs: 8500,
      });
    },
    [providerLabel, showToast],
  );

  const refreshRouters = useCallback(
    async (checkRouters = false, options: { warn?: boolean } = {}) => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${endpoint}?check=${checkRouters ? "1" : "0"}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as {
          routers?: RouterHealth[];
          selectedRouterIndex?: number;
          error?: string;
        };

        if (!response.ok || !payload.routers) {
          throw new Error(payload.error ?? "Router list failed.");
        }

        setRouters(payload.routers);
        const nextSelectedRouterIndex =
          payload.selectedRouterIndex ?? selectedRouterIndex;
        setSelectedRouterIndex(nextSelectedRouterIndex);
        if (options.warn) {
          warnAboutSelectedRouter(payload.routers, nextSelectedRouterIndex);
        }
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Router list failed.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint, selectedRouterIndex, warnAboutSelectedRouter],
  );

  useEffect(() => {
    setSelectedRouterIndex(initialSelectedRouterIndex);
  }, [initialSelectedRouterIndex]);

  useEffect(() => {
    void refreshRouters(true);

    const handleRouterRefresh = () => {
      void refreshRouters(true);
    };

    window.addEventListener(refreshEvent, handleRouterRefresh);

    return () => {
      window.removeEventListener(refreshEvent, handleRouterRefresh);
    };
  }, [refreshEvent, refreshRouters]);

  const updatePanelGeometry = useCallback(
    (useDefaultPosition = false) => {
      const sheet = sheetRef.current;
      const fallbackSize = getFallbackPanelSize(isMinimized);
      const measuredWidth = sheet?.getBoundingClientRect().width ?? 0;
      const measuredHeight = sheet?.getBoundingClientRect().height ?? 0;
      const width = measuredWidth > 0 ? measuredWidth : fallbackSize.width;
      const height = measuredHeight > 0 ? measuredHeight : fallbackSize.height;
      const nextBounds = isMinimized
        ? getMinimizedPanelBounds({ width, height })
        : getPanelBounds({ width, height });

      setDragBounds(nextBounds);
      setPosition((currentPosition) =>
        useDefaultPosition
          ? getDefaultPanelPosition(nextBounds, isMinimized)
          : clampPanelPosition(currentPosition, nextBounds),
      );
    },
    [isMinimized],
  );

  const resetPanelPosition = useCallback(() => {
    const nextBounds = getPanelBounds(getFallbackPanelSize());

    setDragBounds(nextBounds);
    setPosition(getDefaultPanelPosition(nextBounds));
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      updatePanelGeometry(true);
    });

    const handleResize = () => {
      updatePanelGeometry();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [isMinimized, isOpen, updatePanelGeometry]);

  useEffect(() => {
    const sheet = sheetRef.current;

    if (!isOpen || !isMinimized || !sheet || !("ResizeObserver" in window)) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updatePanelGeometry();
    });

    resizeObserver.observe(sheet);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isMinimized, isOpen, updatePanelGeometry]);

  const openPanel = () => {
    setIsMinimized(false);
    resetPanelPosition();
    setIsOpen(true);
  };

  const checkAllRouters = () => {
    void refreshRouters(true, { warn: true });
  };

  const checkRouter = async (routerIndex: number) => {
    setCheckingRouter(routerIndex);
    setError("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routerIndex }),
      });
      const payload = (await response.json()) as {
        router?: RouterHealth;
        selectedRouterIndex?: number;
        error?: string;
      };

      if (!response.ok || !payload.router) {
        throw new Error(payload.error ?? "Router check failed.");
      }

      const nextSelectedRouterIndex =
        payload.selectedRouterIndex ?? selectedRouterIndex;
      const nextRouters = routers.map((router) =>
        router.index === payload.router?.index ? payload.router : router,
      );
      setSelectedRouterIndex(nextSelectedRouterIndex);
      setRouters(nextRouters);
      warnAboutSelectedRouter(nextRouters, nextSelectedRouterIndex);
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : "Router check failed.",
      );
    } finally {
      setCheckingRouter(null);
    }
  };

  const selectRouter = async (routerIndex: number) => {
    setCheckingRouter(routerIndex);
    setError("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", routerIndex }),
      });
      const payload = (await response.json()) as {
        routers?: RouterHealth[];
        selectedRouterIndex?: number;
        error?: string;
      };

      if (!response.ok || !payload.routers || !payload.selectedRouterIndex) {
        throw new Error(payload.error ?? "Router selection failed.");
      }

      setSelectedRouterIndex(payload.selectedRouterIndex);
      setRouters(payload.routers);
      warnAboutSelectedRouter(payload.routers, payload.selectedRouterIndex);
    } catch (selectError) {
      setError(
        selectError instanceof Error
          ? selectError.message
          : "Router selection failed.",
      );
    } finally {
      setCheckingRouter(null);
    }
  };

  const handleDragStart = () => {
    updatePanelGeometry();
    setIsDragging(true);
  };

  const handleDrag = (_event: DraggableEvent, data: DraggableData) => {
    setPosition({ x: data.x, y: data.y });
  };

  const handleDragStop = (_event: DraggableEvent, data: DraggableData) => {
    setPosition(clampPanelPosition({ x: data.x, y: data.y }, dragBounds));
    setIsDragging(false);
  };

  const closePanel = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const restorePanel = () => {
    const nextBounds = getPanelBounds(getFallbackPanelSize());

    setDragBounds(nextBounds);
    setPosition(getDefaultPanelPosition(nextBounds));
    setIsMinimized(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title={defaultRouter?.name ?? "Router 1"}
        className="group relative flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-3 text-xs font-bold transition hover:-translate-y-0.5"
        style={{
          borderColor:
            badgeStatus === "available"
              ? ROUTER_UI.running.edge
              : badgeStatus === "limited"
                ? ROUTER_UI.pending.edge
                : badgeStatus === "invalid" || badgeStatus === "error"
                  ? ROUTER_UI.failed.edge
                  : ROUTER_UI.line,
          background:
            badgeStatus === "available"
              ? ROUTER_UI.running.bg
              : badgeStatus === "limited"
                ? ROUTER_UI.pending.bg
                : badgeStatus === "invalid" || badgeStatus === "error"
                  ? ROUTER_UI.failed.bg
                  : ROUTER_UI.surface,
          color:
            badgeStatus === "available"
              ? ROUTER_UI.running.ink
              : badgeStatus === "limited"
                ? ROUTER_UI.pending.ink
                : badgeStatus === "invalid" || badgeStatus === "error"
                  ? ROUTER_UI.failed.ink
                  : ROUTER_UI.ink,
        }}
        aria-label={`Open ${providerLabel} ${defaultRouter?.name ?? "Router 1"} status`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${DOT_CLASSES[badgeStatus]}`}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">R{defaultRouter?.index ?? 1}</span>
        <span
          className="pointer-events-none absolute right-0 top-[calc(100%+0.45rem)] z-20 whitespace-nowrap rounded-full px-3 py-1 text-[0.68rem] font-semibold opacity-0 transition group-hover:opacity-100"
          style={{
            border: `1px solid ${ROUTER_UI.line}`,
            background: ROUTER_UI.surface,
            color: ROUTER_UI.ink,
            boxShadow: "0 18px 36px -28px rgba(36,50,74,0.4)",
          }}
        >
          {defaultRouter?.name ?? "Router 1"}
        </span>
      </button>

      {isOpen ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          <Draggable
            bounds={dragBounds}
            cancel="button, a, input, textarea, select, [data-no-drag='true']"
            handle=".router-modal-drag-handle"
            nodeRef={sheetRef}
            position={position}
            onDrag={handleDrag}
            onStart={handleDragStart}
            onStop={handleDragStop}
          >
            <DraggableRouterSheet
              data-id={panelDataId}
              isMinimized={isMinimized}
              isDragging={isDragging}
              sheetRef={sheetRef}
            >
              <style>{`
                @keyframes routerQueuePulse {
                  0%, 100% { transform: scale(1); opacity: 1; }
                  50% { transform: scale(1.25); opacity: 0.75; }
                }
                @keyframes routerQueueShimmer {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(100%); }
                }
              `}</style>
              {isMinimized ? (
                <button
                  type="button"
                  onClick={restorePanel}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: "10px 12px",
                    background: "transparent",
                    fontFamily:
                      '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
                    textAlign: "left",
                    pointerEvents: "auto",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 14px 8px 8px",
                      background: ROUTER_UI.surface,
                      border: `1.5px solid ${ROUTER_UI.line}`,
                      borderRadius: "20px 20px 20px 20px",
                      boxShadow:
                        "-8px 6px 24px -8px rgba(184,155,232,0.25), 0 0 0 4px rgba(255,255,255,0.5)",
                      minWidth: 260,
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: 44,
                        height: 44,
                        borderRadius: 999,
                        background: "linear-gradient(135deg, #FFF4FB, #F3EBFF)",
                        display: "grid",
                        placeItems: "center",
                        border: `1.5px solid ${ROUTER_UI.line}`,
                        flexShrink: 0,
                      }}
                    >
                      <BuniMascot size={36} mood={mood} />
                      {counts.available > 0 ? (
                        <span
                          style={{
                            position: "absolute",
                            bottom: -1,
                            right: -1,
                            width: 12,
                            height: 12,
                            borderRadius: 999,
                            background: ROUTER_UI.running.dot,
                            border: `2px solid ${ROUTER_UI.surface}`,
                            animation:
                              "routerQueuePulse 1.3s ease-in-out infinite",
                          }}
                        />
                      ) : null}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: ROUTER_UI.ink,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background:
                              counts.available > 0
                                ? ROUTER_UI.running.dot
                                : ROUTER_UI.pending.dot,
                            animation:
                              "routerQueuePulse 1.3s ease-in-out infinite",
                            flexShrink: 0,
                          }}
                        />
                        {defaultRouter?.name ?? `${providerLabel} router`}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: ROUTER_UI.inkSoft,
                          marginTop: 2,
                        }}
                      >
                        tap to open · {counts.available} ready ·{" "}
                        {counts.attention} needs attention
                      </div>
                    </div>
                  </div>
                </button>
              ) : (
                <>
                  <div
                    style={{
                      padding: "14px 20px 14px 20px",
                      position: "relative",
                      zIndex: 2,
                    }}
                  >
                    <div
                      aria-hidden="true"
                      className={`router-modal-drag-handle absolute left-1/2 top-2 h-1.5 w-12 -translate-x-1/2 touch-none rounded-full bg-foreground/18 ${
                        isDragging ? "cursor-grabbing" : "cursor-grab"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={closePanel}
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 12,
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        border: `1.5px solid ${ROUTER_UI.line}`,
                        background: ROUTER_UI.surface,
                        color: ROUTER_UI.inkSoft,
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        zIndex: 3,
                      }}
                      aria-label="Close router picker"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="2"
                        width="13"
                        height="13"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginTop: 12,
                      }}
                    >
                      <div style={{ position: "relative" }}>
                        <BuniMascot size={44} mood={mood} />
                        {counts.available > 0 ? (
                          <span
                            style={{
                              position: "absolute",
                              bottom: -2,
                              right: -2,
                              width: 14,
                              height: 14,
                              borderRadius: 999,
                              background: ROUTER_UI.running.dot,
                              border: `2px solid ${ROUTER_UI.surface}`,
                              animation:
                                "routerQueuePulse 1.3s ease-in-out infinite",
                            }}
                          />
                        ) : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            letterSpacing: -0.2,
                          }}
                        >
                          {providerLabel} Router
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 10,
                              fontWeight: 600,
                              color: ROUTER_UI.accent2,
                              background: "#F3EBFF",
                              padding: "2px 8px",
                              borderRadius: 999,
                              verticalAlign: "middle",
                            }}
                          >
                            ✦ buni
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: ROUTER_UI.inkSoft,
                            marginTop: 2,
                          }}
                        >
                          {counts.available > 0
                            ? `${counts.available} router${counts.available > 1 ? "s" : ""} ready to use`
                            : counts.attention > 0
                              ? `${counts.attention} router${counts.attention > 1 ? "s" : ""} need attention`
                              : "router panel is quiet ♡"}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 14,
                      }}
                    >
                      <RouterCountChip
                        label="using"
                        count={counts.using}
                        tone={ROUTER_UI.completed}
                      />
                      <RouterCountChip
                        label="ready"
                        count={counts.available}
                        tone={ROUTER_UI.running}
                      />
                      <RouterCountChip
                        label="attention"
                        count={counts.attention}
                        tone={ROUTER_UI.pending}
                      />
                      <RouterCountChip
                        label="failed"
                        count={counts.failed}
                        tone={ROUTER_UI.failed}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "0 20px",
                      display: "flex",
                      gap: 4,
                      position: "relative",
                      zIndex: 2,
                      overflowX: "auto",
                    }}
                  >
                    {[
                      ["all", "All", counts.total],
                      ["using", "Using", counts.using],
                      ["available", "Ready", counts.available],
                      ["attention", "Attention", counts.attention],
                    ].map(([key, label, count]) => {
                      const active = filter === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFilter(key as typeof filter)}
                          style={{
                            border: "none",
                            background: "transparent",
                            padding: "10px 10px 12px 10px",
                            fontSize: 12,
                            fontWeight: active ? 700 : 500,
                            color: active ? ROUTER_UI.ink : ROUTER_UI.inkMute,
                            cursor: "pointer",
                            position: "relative",
                            fontFamily: "inherit",
                            flexShrink: 0,
                          }}
                        >
                          {label}{" "}
                          <span style={{ opacity: 0.55, fontWeight: 500 }}>
                            {count}
                          </span>
                          {active ? (
                            <span
                              style={{
                                position: "absolute",
                                bottom: -1,
                                left: 6,
                                right: 6,
                                height: 3,
                                borderRadius: 3,
                                background: `linear-gradient(90deg, ${ROUTER_UI.accent2}, ${ROUTER_UI.accent})`,
                              }}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="overflow-y-auto px-4 py-3"
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {error ? (
                      <div
                        className="mb-3 rounded-lg px-3 py-2 text-xs font-semibold"
                        style={{
                          border: `1px solid ${ROUTER_UI.failed.edge}`,
                          background: ROUTER_UI.failed.bg,
                          color: ROUTER_UI.failed.ink,
                        }}
                      >
                        {error}
                      </div>
                    ) : null}

                    {filteredRouters.length ? (
                      filteredRouters.map((router) => (
                        <RouterRow
                          key={router.index}
                          router={router}
                          selectedRouterIndex={selectedRouterIndex}
                          isLoading={isLoading}
                          isChecking={checkingRouter === router.index}
                          onCheck={() => void checkRouter(router.index)}
                          onSelect={() => void selectRouter(router.index)}
                        />
                      ))
                    ) : (
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 10,
                          color: ROUTER_UI.inkSoft,
                          fontSize: 13,
                          paddingTop: 20,
                          textAlign: "center",
                        }}
                      >
                        <BuniMascot size={72} mood="idle" />
                        <div style={{ fontWeight: 600, color: ROUTER_UI.ink }}>
                          nothing here yet ♡
                        </div>
                        <div style={{ fontSize: 11.5, maxWidth: 220 }}>
                          routers will show up here when Buni checks your
                          provider setup
                        </div>
                      </div>
                    )}

                    {canValidateKeys && settingsSlot ? (
                      <div style={{ marginTop: 6 }}>{settingsSlot}</div>
                    ) : null}
                  </div>
                  <div
                    style={{
                      padding: "12px 16px 14px 16px",
                      background: ROUTER_UI.surface,
                      display: "flex",
                      gap: 8,
                      position: "relative",
                      zIndex: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    <RouterFooterButton
                      label={isLoading ? "Checking all..." : "Check all"}
                      onClick={checkAllRouters}
                      disabled={isLoading || checkingRouter !== null}
                      tone="accent"
                    />
                    <div style={{ flex: 1 }} />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0 10px",
                        fontSize: 11,
                        color: ROUTER_UI.inkSoft,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: ROUTER_UI.running.dot,
                          animation:
                            "routerQueuePulse 1.3s ease-in-out infinite",
                        }}
                      />
                      live
                    </div>
                  </div>
                </>
              )}
            </DraggableRouterSheet>
          </Draggable>
        </div>
      ) : null}
    </>
  );
}
