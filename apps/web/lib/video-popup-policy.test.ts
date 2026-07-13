import { describe, expect, it } from "vitest";
import { shouldShowVideoPopup } from "./video-popup-policy";

const now = new Date("2026-07-08T12:00:00.000Z");

describe("video popup policy", () => {
  it("shows on first visit when enabled", () => {
    expect(
      shouldShowVideoPopup({
        enabled: true,
        frequency: "first_visit",
        now,
        state: {}
      })
    ).toBe(true);
  });

  it("does not show again after first visit dismissal", () => {
    expect(
      shouldShowVideoPopup({
        enabled: true,
        frequency: "first_visit",
        now,
        state: { dismissedAt: "2026-07-08T10:00:00.000Z" }
      })
    ).toBe(false);
  });

  it("respects daily frequency", () => {
    expect(
      shouldShowVideoPopup({
        enabled: true,
        frequency: "daily",
        now,
        state: { lastShownAt: "2026-07-08T08:00:00.000Z" }
      })
    ).toBe(false);

    expect(
      shouldShowVideoPopup({
        enabled: true,
        frequency: "daily",
        now,
        state: { lastShownAt: "2026-07-07T08:00:00.000Z" }
      })
    ).toBe(true);
  });

  it("does not show outside configured date range", () => {
    expect(
      shouldShowVideoPopup({
        enabled: true,
        frequency: "every_visit",
        startsAt: "2026-07-09T00:00:00.000Z",
        now,
        state: {}
      })
    ).toBe(false);
  });
});
