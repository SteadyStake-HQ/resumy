const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN =
  /(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github|gitlab|bitbucket|behance|dribbble|medium)\.[^\s|,;]+/gi;
const PHONE_LABEL_PATTERN =
  /\b(?:phone|mobile|cell|tel|telephone|contact|call|whatsapp)\b/i;
const PHONE_CANDIDATE_PATTERN =
  /(?:^|[^\w@./-])(\+?\d(?:[\d\s().-]*\d){6,})(?=$|[^\w@./-])/g;
const DATE_RANGE_LIKE_PATTERN =
  /\b(?:19|20)\d{2}\s*(?:-|–|—|\/|\.|to)\s*(?:present|current|now|(?:19|20)\d{2})\b/i;
const POSTAL_CODE_PATTERN = /^(?:\d{5}-\d{4}|\d{5}-?\d{3})$/;
const URL_OR_HANDLE_HINT_PATTERN =
  /\b(?:https?:\/\/|www\.|linkedin|github|gitlab|bitbucket|behance|dribbble|medium)\b|@/i;
const TRAILING_URL_PUNCTUATION_PATTERN = /[),.;\]]+$/;
const PROFILE_HEADER_HINT_PATTERN =
  /\b(?:linkedin|github|gitlab|bitbucket|portfolio|website|site|behance|dribbble|medium)\b/i;

export type ProfileLinkType =
  | "linkedin"
  | "github"
  | "gitlab"
  | "bitbucket"
  | "portfolio"
  | "website"
  | "other";

export type ExtractedProfileLink = {
  type: ProfileLinkType;
  label: string;
  url: string;
};

function getDigits(value: string) {
  return value.match(/\d/g)?.join("") ?? "";
}

function stripNonPhoneContactText(value: string) {
  return value.replace(EMAIL_PATTERN, " ").replace(URL_PATTERN, " ");
}

export function normalizeProfileUrl(value: string) {
  const cleanedValue = value
    .trim()
    .replace(/\s+/g, "")
    .replace(TRAILING_URL_PUNCTUATION_PATTERN, "")
    .replace(/^www\./i, "https://www.")
    .replace(/^(?!https?:\/\/)/i, "https://");

  try {
    const url = new URL(cleanedValue);

    if (!url.hostname.includes(".")) {
      return "";
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function classifyProfileLink(url: string): Pick<ExtractedProfileLink, "type" | "label"> {
  const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

  if (host.includes("linkedin.")) {
    return { type: "linkedin", label: "LinkedIn" };
  }

  if (host.includes("github.")) {
    return { type: "github", label: "GitHub" };
  }

  if (host.includes("gitlab.")) {
    return { type: "gitlab", label: "GitLab" };
  }

  if (host.includes("bitbucket.")) {
    return { type: "bitbucket", label: "Bitbucket" };
  }

  if (
    host.includes("behance.") ||
    host.includes("dribbble.") ||
    host.includes("medium.")
  ) {
    return { type: "portfolio", label: "Portfolio" };
  }

  return { type: "website", label: "Website" };
}

export function normalizePhoneValue(value: string, sourceText = value) {
  const phone = value
    .replace(/^\s*(?:phone|mobile|cell|tel|telephone|contact|call|whatsapp)\s*[:|-]?\s*/i, "")
    .replace(/[^\d+().\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!phone || URL_OR_HANDLE_HINT_PATTERN.test(phone)) {
    return "";
  }

  const digits = getDigits(phone);

  if (digits.length < 7 || digits.length > 15) {
    return "";
  }

  if (DATE_RANGE_LIKE_PATTERN.test(phone)) {
    return "";
  }

  const isBareShortNumber = /^\d{7,9}$/.test(phone);
  const hasExplicitPhoneLabel = PHONE_LABEL_PATTERN.test(sourceText);
  const hasCountryPrefix = phone.startsWith("+");
  const hasPhoneFormatting = /[().\s-]/.test(phone) && !/^\d+$/.test(phone);
  const compactPhone = phone.replace(/\s+/g, "");

  if (!hasExplicitPhoneLabel && POSTAL_CODE_PATTERN.test(compactPhone)) {
    return "";
  }

  if (
    digits.length < 10 &&
    !hasExplicitPhoneLabel &&
    !hasCountryPrefix &&
    !hasPhoneFormatting
  ) {
    return "";
  }

  if (isBareShortNumber && !hasExplicitPhoneLabel && !hasCountryPrefix) {
    return "";
  }

  return phone;
}

export function extractPhoneFromText(rawText: string) {
  const candidates = rawText
    .split("\n")
    .map((line, index) => ({
      index,
      original: line.trim(),
      searchable: stripNonPhoneContactText(line).trim(),
    }))
    .filter((line) => line.original && line.searchable);

  let bestMatch: { phone: string; score: number } | null = null;

  for (const line of candidates) {
    for (const match of line.searchable.matchAll(PHONE_CANDIDATE_PATTERN)) {
      const phone = normalizePhoneValue(match[1] ?? "", line.original);

      if (!phone) {
        continue;
      }

      const digits = getDigits(phone);
      const score =
        (PHONE_LABEL_PATTERN.test(line.original) ? 20 : 0) +
        (phone.startsWith("+") ? 12 : 0) +
        (digits.length >= 10 ? 8 : 0) +
        (line.index <= 8 ? 5 : 0) +
        (/[().\s-]/.test(phone) ? 3 : 0);

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { phone, score };
      }
    }
  }

  return bestMatch?.phone ?? "";
}

export function extractProfileLinksFromText(rawText: string) {
  const links: ExtractedProfileLink[] = [];
  const seenUrls = new Set<string>();
  const lines = rawText.split("\n");

  for (const match of rawText.matchAll(URL_PATTERN)) {
    const rawUrl = match[0] ?? "";
    const index = match.index ?? 0;
    const previousChar = rawText[index - 1] ?? "";

    if (previousChar === "@") {
      continue;
    }

    const lineIndex =
      rawText.slice(0, index).match(/\n/g)?.length ?? 0;
    const sourceLine = lines[lineIndex]?.trim() ?? "";

    if (
      !sourceLine ||
      /@/.test(rawUrl) ||
      (!/^(?:https?:\/\/|www\.|linkedin\.|github\.|gitlab\.|bitbucket\.|behance\.|dribbble\.|medium\.)/i.test(rawUrl) &&
        !PROFILE_HEADER_HINT_PATTERN.test(sourceLine))
    ) {
      continue;
    }

    const url = normalizeProfileUrl(rawUrl);

    if (!url || seenUrls.has(url.toLowerCase())) {
      continue;
    }

    seenUrls.add(url.toLowerCase());
    links.push({
      ...classifyProfileLink(url),
      url,
    });
  }

  return links.slice(0, 8);
}
