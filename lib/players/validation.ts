export class PlayerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerValidationError";
  }
}

export type UrlValue = string | string[] | undefined;

export function parsePage(value: UrlValue): number {
  if (value === undefined) return 1;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new PlayerValidationError("Page must be a whole number from 1 to 10,000.");
  }
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page > 10000) {
    throw new PlayerValidationError("Page must be a whole number from 1 to 10,000.");
  }
  return page;
}

export function parseSearch(value: UrlValue): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 80) {
    throw new PlayerValidationError("Search must be a single name of at most 80 characters.");
  }
  return value.trim();
}

export function parsePlayerId(value: string): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new PlayerValidationError("Player ID must be a valid positive whole number.");
  }
  return Number(value);
}

export function escapeSearch(value: string): string {
  // Treat SQL LIKE metacharacters literally; Supabase passes the value as data.
  return value.replace(/[\\%_]/g, "\\$&");
}
