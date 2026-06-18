import { getData } from "country-list";

const COUNTRY_NAME_BY_NORMALIZED = new Map<string, string>();
const COUNTRY_ALIASES = new Map<string, string>([
  ["united states", "United States"],
  ["united states of america", "United States"],
  ["usa", "United States"],
  ["u s a", "United States"],
  ["us", "United States"],
  ["u s", "United States"],
  ["united kingdom", "United Kingdom"],
  ["uk", "United Kingdom"],
  ["u k", "United Kingdom"],
  ["great britain", "United Kingdom"],
  ["england", "United Kingdom"],
  ["scotland", "United Kingdom"],
  ["wales", "United Kingdom"],
  ["northern ireland", "United Kingdom"],
  ["united arab emirates", "United Arab Emirates"],
  ["uae", "United Arab Emirates"],
  ["south korea", "South Korea"],
  ["north korea", "North Korea"],
  ["czech republic", "Czechia"],
  ["ivory coast", "Cote d'Ivoire"],
]);

const US_STATES = new Map<string, string>([
  ["al", "Alabama"],
  ["alabama", "Alabama"],
  ["ak", "Alaska"],
  ["alaska", "Alaska"],
  ["az", "Arizona"],
  ["arizona", "Arizona"],
  ["ar", "Arkansas"],
  ["arkansas", "Arkansas"],
  ["ca", "California"],
  ["california", "California"],
  ["co", "Colorado"],
  ["colorado", "Colorado"],
  ["ct", "Connecticut"],
  ["connecticut", "Connecticut"],
  ["de", "Delaware"],
  ["delaware", "Delaware"],
  ["dc", "District of Columbia"],
  ["district of columbia", "District of Columbia"],
  ["fl", "Florida"],
  ["florida", "Florida"],
  ["ga", "Georgia"],
  ["georgia", "Georgia"],
  ["hi", "Hawaii"],
  ["hawaii", "Hawaii"],
  ["id", "Idaho"],
  ["idaho", "Idaho"],
  ["il", "Illinois"],
  ["illinois", "Illinois"],
  ["in", "Indiana"],
  ["indiana", "Indiana"],
  ["ia", "Iowa"],
  ["iowa", "Iowa"],
  ["ks", "Kansas"],
  ["kansas", "Kansas"],
  ["ky", "Kentucky"],
  ["kentucky", "Kentucky"],
  ["la", "Louisiana"],
  ["louisiana", "Louisiana"],
  ["me", "Maine"],
  ["maine", "Maine"],
  ["md", "Maryland"],
  ["maryland", "Maryland"],
  ["ma", "Massachusetts"],
  ["massachusetts", "Massachusetts"],
  ["mi", "Michigan"],
  ["michigan", "Michigan"],
  ["mn", "Minnesota"],
  ["minnesota", "Minnesota"],
  ["ms", "Mississippi"],
  ["mississippi", "Mississippi"],
  ["mo", "Missouri"],
  ["missouri", "Missouri"],
  ["mt", "Montana"],
  ["montana", "Montana"],
  ["ne", "Nebraska"],
  ["nebraska", "Nebraska"],
  ["nv", "Nevada"],
  ["nevada", "Nevada"],
  ["nh", "New Hampshire"],
  ["new hampshire", "New Hampshire"],
  ["nj", "New Jersey"],
  ["new jersey", "New Jersey"],
  ["nm", "New Mexico"],
  ["new mexico", "New Mexico"],
  ["ny", "New York"],
  ["new york", "New York"],
  ["nc", "North Carolina"],
  ["north carolina", "North Carolina"],
  ["nd", "North Dakota"],
  ["north dakota", "North Dakota"],
  ["oh", "Ohio"],
  ["ohio", "Ohio"],
  ["ok", "Oklahoma"],
  ["oklahoma", "Oklahoma"],
  ["or", "Oregon"],
  ["oregon", "Oregon"],
  ["pa", "Pennsylvania"],
  ["pennsylvania", "Pennsylvania"],
  ["ri", "Rhode Island"],
  ["rhode island", "Rhode Island"],
  ["sc", "South Carolina"],
  ["south carolina", "South Carolina"],
  ["sd", "South Dakota"],
  ["south dakota", "South Dakota"],
  ["tn", "Tennessee"],
  ["tennessee", "Tennessee"],
  ["tx", "Texas"],
  ["texas", "Texas"],
  ["ut", "Utah"],
  ["utah", "Utah"],
  ["vt", "Vermont"],
  ["vermont", "Vermont"],
  ["va", "Virginia"],
  ["virginia", "Virginia"],
  ["wa", "Washington"],
  ["washington", "Washington"],
  ["wv", "West Virginia"],
  ["west virginia", "West Virginia"],
  ["wi", "Wisconsin"],
  ["wisconsin", "Wisconsin"],
  ["wy", "Wyoming"],
  ["wyoming", "Wyoming"],
]);

const REMOTE_TERMS = new Set([
  "remote",
  "worldwide",
  "global",
  "hybrid",
  "onsite",
  "on site",
  "work from home",
]);

const ROLE_KEYWORDS = [
  "engineer",
  "developer",
  "manager",
  "analyst",
  "specialist",
  "designer",
  "consultant",
  "architect",
  "director",
  "founder",
  "lead",
  "full stack",
  "frontend",
  "front end",
  "backend",
  "back end",
  "software",
  "product",
  "marketing",
  "sales",
  "operations",
  "qa",
  "tester",
  "intern",
];

for (const country of getData()) {
  COUNTRY_NAME_BY_NORMALIZED.set(normalizeLocationSegment(country.name), country.name);
}

for (const [alias, canonicalName] of COUNTRY_ALIASES) {
  COUNTRY_NAME_BY_NORMALIZED.set(alias, canonicalName);
}

function normalizeLocationSegment(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanLocationSegment(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[,;|/-]+|[,;|/-]+$/g, "").trim();
}

function splitLocationSegments(value: string) {
  return value
    .replace(/[()]/g, ",")
    .split(/[|,;/]+/)
    .map((segment) => cleanLocationSegment(segment))
    .filter(Boolean);
}

function isRoleLikeSegment(value: string) {
  return ROLE_KEYWORDS.some((keyword) => value.includes(keyword));
}

export function formatResumeLocation(value: string) {
  const segments = splitLocationSegments(value);

  if (!segments.length) {
    return "";
  }

  let countryName = "";
  let stateName = "";
  let matchedStateSegment = "";

  for (const segment of segments) {
    const normalizedSegment = normalizeLocationSegment(segment);
    const matchedCountry = COUNTRY_NAME_BY_NORMALIZED.get(normalizedSegment);

    if (matchedCountry) {
      countryName = matchedCountry;
      break;
    }
  }

  for (const segment of [...segments].reverse()) {
    const normalizedSegment = normalizeLocationSegment(segment);
    const matchedState = US_STATES.get(normalizedSegment);

    if (matchedState) {
      stateName = matchedState;
      matchedStateSegment = normalizedSegment;
      break;
    }
  }

  if (!countryName && stateName) {
    countryName = "United States";
  }

  if (!countryName && !stateName) {
    return "";
  }

  let city = "";

  for (const segment of segments) {
    const normalizedSegment = normalizeLocationSegment(segment);

    if (
      !normalizedSegment ||
      REMOTE_TERMS.has(normalizedSegment) ||
      COUNTRY_NAME_BY_NORMALIZED.get(normalizedSegment) ||
      normalizedSegment === matchedStateSegment
    ) {
      continue;
    }

    if (/\d/.test(normalizedSegment) || isRoleLikeSegment(normalizedSegment)) {
      continue;
    }

    city = cleanLocationSegment(segment);
    break;
  }

  const orderedParts = [countryName];

  if (countryName === "United States" && stateName) {
    orderedParts.push(stateName);
  }

  if (city) {
    orderedParts.push(city);
  }

  return orderedParts.filter(Boolean).join(", ");
}
