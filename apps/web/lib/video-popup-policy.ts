export type VideoPopupFrequency = "every_visit" | "daily" | "weekly" | "first_visit" | "off";

export interface VideoPopupState {
  firstShownAt?: string;
  lastShownAt?: string;
  dismissedAt?: string;
}

export interface VideoPopupPolicyInput {
  enabled: boolean;
  frequency: VideoPopupFrequency;
  startsAt?: string;
  endsAt?: string;
  now?: Date;
  state?: VideoPopupState | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export function shouldShowVideoPopup(input: VideoPopupPolicyInput): boolean {
  if (!input.enabled || input.frequency === "off") {
    return false;
  }

  const now = input.now ?? new Date();
  if (!isInsideDateRange(now, input.startsAt, input.endsAt)) {
    return false;
  }

  const state = input.state ?? {};
  if (input.frequency === "every_visit") {
    return true;
  }

  if (input.frequency === "first_visit") {
    return !state.dismissedAt && !state.firstShownAt;
  }

  const lastShownAt = parseDate(state.lastShownAt ?? state.dismissedAt);
  if (!lastShownAt) {
    return true;
  }

  const elapsedMs = now.getTime() - lastShownAt.getTime();
  return input.frequency === "daily" ? elapsedMs >= DAY_MS : elapsedMs >= WEEK_MS;
}

export function isInsideDateRange(now: Date, startsAt?: string, endsAt?: string): boolean {
  const start = parseDate(startsAt);
  const end = parseDate(endsAt);

  if (start && now.getTime() < start.getTime()) {
    return false;
  }

  if (end && now.getTime() > end.getTime()) {
    return false;
  }

  return true;
}

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
