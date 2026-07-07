import { describe, expect, it } from "vitest";
import { resolveAdminHashPath } from "./admin-navigation";

describe("resolveAdminHashPath", () => {
  it("redirects legacy quote and order hashes to route pages", () => {
    expect(resolveAdminHashPath("#quotes")).toBe("/admin/quotes");
    expect(resolveAdminHashPath("#orders")).toBe("/admin/orders");
  });

  it("ignores unknown hashes", () => {
    expect(resolveAdminHashPath("#pricing")).toBeNull();
    expect(resolveAdminHashPath("")).toBeNull();
  });
});
