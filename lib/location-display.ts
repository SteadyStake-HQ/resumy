import {
  COUNTRY_CODE_SET,
  countryCodeToFlagEmoji,
  inferCountryCodeFromText,
} from "@/lib/countries";

export type LocationDisplayData = {
  countryCode: string;
  displayLocation: string;
};

function stripCountryCodePrefix(location: string, countryCode: string) {
  const prefixPattern = new RegExp(`^${countryCode}(?=[\\s,;|/-])`, "i");

  return location
    .replace(prefixPattern, "")
    .replace(/^[\s,;|/-]+/, "")
    .trim();
}

export function getLocationDisplayData(location: string): LocationDisplayData {
  const inferredCountryCode = inferCountryCodeFromText(location);

  if (inferredCountryCode) {
    return {
      countryCode: inferredCountryCode,
      displayLocation: stripCountryCodePrefix(location, inferredCountryCode) || location,
    };
  }

  const prefixedCodeMatch = location.match(/^([A-Za-z]{2})(?=[\s,;|/-]+)(.+)$/);

  if (!prefixedCodeMatch) {
    return { countryCode: "", displayLocation: location };
  }

  const prefixedCountryCode = prefixedCodeMatch[1].toUpperCase();

  if (!COUNTRY_CODE_SET.has(prefixedCountryCode)) {
    return { countryCode: "", displayLocation: location };
  }

  const displayLocation = stripCountryCodePrefix(location, prefixedCountryCode);
  const remainderCountryCode = inferCountryCodeFromText(displayLocation);

  if (remainderCountryCode !== prefixedCountryCode) {
    return { countryCode: "", displayLocation: location };
  }

  return {
    countryCode: prefixedCountryCode,
    displayLocation: displayLocation || location,
  };
}

export function formatLocationWithFlag(location: string) {
  const trimmedLocation = location.trim();

  if (!trimmedLocation) {
    return "";
  }

  const { countryCode, displayLocation } = getLocationDisplayData(trimmedLocation);

  if (!countryCode) {
    return displayLocation;
  }

  return `${countryCodeToFlagEmoji(countryCode)} ${displayLocation}`;
}
