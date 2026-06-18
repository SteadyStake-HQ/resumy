import { getData } from "country-list";
import type { ParsedResumeData } from "@/lib/resume";

export const COUNTRIES = getData()
  .map((country) => ({
    code: country.code,
    name: country.name,
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

export const COUNTRY_CODE_SET = new Set(COUNTRIES.map((country) => country.code));

const AMBIGUOUS_COUNTRY_NAMES = new Set(["georgia"]);

const COUNTRY_ALIASES = new Map<string, string>([
  ["united states", "US"],
  ["united states of america", "US"],
  ["usa", "US"],
  ["u s a", "US"],
  ["us", "US"],
  ["u s", "US"],
  ["united kingdom", "GB"],
  ["uk", "GB"],
  ["u k", "GB"],
  ["great britain", "GB"],
  ["england", "GB"],
  ["scotland", "GB"],
  ["wales", "GB"],
  ["northern ireland", "GB"],
  ["united arab emirates", "AE"],
  ["uae", "AE"],
  ["south korea", "KR"],
  ["north korea", "KP"],
  ["czech republic", "CZ"],
  ["russia", "RU"],
  ["moldova", "MD"],
  ["bolivia", "BO"],
  ["tanzania", "TZ"],
  ["venezuela", "VE"],
  ["laos", "LA"],
  ["syria", "SY"],
  ["taiwan", "TW"],
  ["palestine", "PS"],
  ["ivory coast", "CI"],
]);

const COUNTRY_NAME_TO_CODE = new Map<string, string>();

for (const country of COUNTRIES) {
  const normalizedName = normalizeCountryText(country.name);

  if (!normalizedName || AMBIGUOUS_COUNTRY_NAMES.has(normalizedName)) {
    continue;
  }

  COUNTRY_NAME_TO_CODE.set(normalizedName, country.code);
}

for (const [alias, code] of COUNTRY_ALIASES) {
  COUNTRY_NAME_TO_CODE.set(alias, code);
}

const US_STATE_NAMES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "district of columbia",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
]);

function normalizeCountryText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getLocationSegments(value: string) {
  return value
    .replace(/[()]/g, ",")
    .split(/[|,;/]+/)
    .map((segment) => normalizeCountryText(segment))
    .filter(Boolean);
}

export function inferCountryCodeFromText(value: string) {
  const normalizedValue = normalizeCountryText(value);

  if (!normalizedValue) {
    return "";
  }

  const candidates = [...getLocationSegments(value), normalizedValue];

  for (const candidate of candidates) {
    const code = COUNTRY_NAME_TO_CODE.get(candidate);

    if (code) {
      return code;
    }
  }

  for (const segment of getLocationSegments(value)) {
    if (US_STATE_NAMES.has(segment)) {
      return "US";
    }
  }

  return "";
}

export function inferCountryCodeFromResume(parsedResumeData: ParsedResumeData) {
  const locationCandidates = [
    parsedResumeData.personalInfo.location,
    ...parsedResumeData.experience.map((entry) => entry.location),
  ];
  const seen = new Set<string>();

  for (const location of locationCandidates) {
    const normalizedLocation = normalizeCountryText(location);

    if (!normalizedLocation || seen.has(normalizedLocation)) {
      continue;
    }

    seen.add(normalizedLocation);

    const countryCode = inferCountryCodeFromText(location);

    if (countryCode) {
      return countryCode;
    }
  }

  return "";
}

export function countryCodeToFlagEmoji(countryCode: string) {
  if (!countryCode || countryCode.length !== 2) {
    return "🌍";
  }

  return countryCode
    .toUpperCase()
    .split("")
    .map((character) =>
      String.fromCodePoint(127397 + character.charCodeAt(0)),
    )
    .join("");
}
