import { describe, expect, it } from "vitest";
import { isPublicNetworkAddress } from "./network-safety";

describe("isPublicNetworkAddress", () => {
  it("rejects local and private IPv4 ranges", () => {
    for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1"]) {
      expect(isPublicNetworkAddress(address)).toBe(false);
    }
  });

  it("rejects local IPv6 ranges", () => {
    for (const address of ["::1", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPublicNetworkAddress(address)).toBe(false);
    }
  });

  it("accepts public addresses", () => {
    expect(isPublicNetworkAddress("1.1.1.1")).toBe(true);
    expect(isPublicNetworkAddress("2606:4700:4700::1111")).toBe(true);
  });
});
