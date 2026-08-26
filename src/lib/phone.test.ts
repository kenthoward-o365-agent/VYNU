import { describe, it, expect } from "vitest";
import { normalizeAuPhone } from "./phone";

describe("normalizeAuPhone", () => {
  it("normalises 04-prefixed AU mobiles to E.164", () => {
    expect(normalizeAuPhone("0400 118 334")).toBe("+61400118334");
    expect(normalizeAuPhone("0412345678")).toBe("+61412345678");
  });

  it("normalises bare 4-prefixed 9-digit mobiles", () => {
    expect(normalizeAuPhone("400118334")).toBe("+61400118334");
  });

  it("passes through international numbers with +", () => {
    expect(normalizeAuPhone("+61400118334")).toBe("+61400118334");
    expect(normalizeAuPhone("+1 727 555 0100")).toBe("+17275550100");
  });

  it("prefixes 61-country-code numbers missing the +", () => {
    expect(normalizeAuPhone("61400118334")).toBe("+61400118334");
  });

  it("strips formatting characters", () => {
    expect(normalizeAuPhone("(04) 0011-8334")).toBe("+61400118334");
  });

  it("rejects unusable input", () => {
    expect(normalizeAuPhone("")).toBeNull();
    expect(normalizeAuPhone("abc")).toBeNull();
    expect(normalizeAuPhone("+61")).toBeNull();
    expect(normalizeAuPhone("1234")).toBeNull();
  });
});
