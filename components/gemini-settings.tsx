"use client";

import { useState, type FormEvent } from "react";

type GeminiQuotaInfo = {
  remainingRequests: string | null;
  remainingTokens: string | null;
  reset: string | null;
  resetAt: string | null;
};

type GeminiValidationResult = {
  ok: boolean;
  status: "valid" | "invalid" | "limited" | "error";
  statusCode: number | null;
  message: string;
  quota: GeminiQuotaInfo;
  checkedAt: string;
};

type GeminiValidationError = {
  error: string;
};

function formatReset(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  const resetDate = new Date(value);

  if (Number.isNaN(resetDate.getTime())) {
    return "Unknown";
  }

  const diffMs = resetDate.getTime() - Date.now();

  if (diffMs <= 0) {
    return "Now";
  }

  const minutes = Math.ceil(diffMs / 60000);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function quotaValue(value: string | null) {
  return value ?? "Unknown";
}

export function GeminiSettings() {
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<GeminiValidationResult | null>(null);
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsValidating(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/auth/validate-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const payload = (await response.json()) as
        | GeminiValidationResult
        | GeminiValidationError;

      if ("error" in payload) {
        throw new Error(payload.error);
      }

      if (!response.ok) {
        throw new Error("Gemini validation failed.");
      }

      setResult(payload);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Gemini validation failed.",
      );
    } finally {
      setIsValidating(false);
    }
  };

  const quota = result?.quota;

  return (
    <section
      style={{
        borderRadius: 16,
        border: "1.5px solid #E9D9B8",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FFF4DD 100%)",
        padding: 14,
        boxShadow: "0 16px 34px -26px rgba(46,38,64,0.12)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "#7B6A4A",
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            Settings
          </p>
          <h3
            style={{
              marginTop: 6,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: -0.2,
              color: "#2F2A1F",
            }}
          >
            Validate Gemini key
          </h3>
        </div>
        {result ? (
          <span
            style={{
              borderRadius: 999,
              border: `1px solid ${result.ok ? "#BFE9D4" : "#F7C3B6"}`,
              background: result.ok ? "#E4F7EE" : "#FFE3DC",
              color: result.ok ? "#2F7A56" : "#B14A36",
              padding: "4px 10px",
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              fontFamily: 'var(--font-ibm-plex-mono), monospace',
            }}
          >
            {result.status}
          </span>
        ) : null}
      </div>

      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Paste key or leave blank for default"
          autoComplete="off"
          spellCheck={false}
          style={{
            minHeight: 40,
            flex: 1,
            borderRadius: 999,
            border: "1.5px solid #E9D9B8",
            background: "#FFFFFF",
            padding: "0 14px",
            fontSize: 12,
            color: "#2F2A1F",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={isValidating}
          style={{
            minHeight: 40,
            borderRadius: 999,
            border: "1.5px solid #F3E3A8",
            background: "#FFF4D6",
            color: "#8C6A10",
            padding: "0 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: isValidating ? "not-allowed" : "pointer",
            opacity: isValidating ? 0.6 : 1,
          }}
        >
          {isValidating ? "Validating..." : "Validate"}
        </button>
      </form>

      {error ? (
        <p
          style={{
            marginTop: 10,
            borderRadius: 12,
            border: "1px solid #F7C3B6",
            background: "#FFE3DC",
            padding: "10px 12px",
            fontSize: 12,
            fontWeight: 600,
            color: "#B14A36",
          }}
        >
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 space-y-2">
          <p style={{ fontSize: 12, fontWeight: 600, color: "#7B6A4A" }}>{result.message}</p>
          <div className="grid grid-cols-3 gap-2">
            <div style={{ borderRadius: 12, border: "1px solid #E9D9B8", background: "#FFFFFF", padding: "10px 10px" }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, color: "#7B6A4A", fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>
                Requests
              </p>
              <p style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: "#2F2A1F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {quotaValue(quota?.remainingRequests ?? null)}
              </p>
            </div>
            <div style={{ borderRadius: 12, border: "1px solid #E9D9B8", background: "#FFFFFF", padding: "10px 10px" }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, color: "#7B6A4A", fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>
                Tokens
              </p>
              <p style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: "#2F2A1F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {quotaValue(quota?.remainingTokens ?? null)}
              </p>
            </div>
            <div style={{ borderRadius: 12, border: "1px solid #E9D9B8", background: "#FFFFFF", padding: "10px 10px" }}>
              <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, color: "#7B6A4A", fontFamily: 'var(--font-ibm-plex-mono), monospace' }}>
                Reset
              </p>
              <p style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: "#2F2A1F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {formatReset(quota?.resetAt ?? null)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
