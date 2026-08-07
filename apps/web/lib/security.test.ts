import { describe, expect, it } from "vitest";
import { constantTimeEqual, readBodyText, RequestSecurityError, safeInternalRedirect, trustedMutationError, validatePasswordStrength } from "./security";

describe("security helpers", () => {
  it("only accepts same-origin relative redirects", () => {
    expect(safeInternalRedirect("/account?tab=1#security", "/account")).toBe("/account?tab=1#security");
    for (const value of ["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)"]) {
      expect(safeInternalRedirect(value, "/account")).toBe("/account");
    }
  });

  it("compares secrets without returning true for unequal lengths", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
  });

  it("enforces a bounded request body for chunked requests", async () => {
    const request = new Request("https://entasburada.com/api/test", { method: "POST", body: "123456" });
    await expect(readBodyText(request, 5)).rejects.toMatchObject({ status: 413 } satisfies Partial<RequestSecurityError>);
  });

  it("rejects cross-site mutations and accepts the configured origin", () => {
    const rejected = new Request("https://entasburada.com/api/test", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" }
    });
    expect(trustedMutationError(rejected)?.status).toBe(403);

    const accepted = new Request("https://entasburada.com/api/test", {
      method: "POST",
      headers: { origin: "https://entasburada.com", "sec-fetch-site": "same-origin" }
    });
    expect(trustedMutationError(accepted)).toBeNull();
  });

  it("requires a strong customer password", () => {
    expect(validatePasswordStrength("weakpassword")).not.toBeNull();
    expect(validatePasswordStrength("Güçlü-Şifre-2026!")).toBeNull();
  });
});
