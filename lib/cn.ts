/**
 * Joins optional class name fragments into a single space-separated string.
 */
export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
