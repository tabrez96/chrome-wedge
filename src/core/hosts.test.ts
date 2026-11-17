// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  hostOfUrl,
  isAllowed,
  isValidHost,
  normaliseHost,
  withSite,
  withoutSite,
} from "./hosts";

describe("normaliseHost", () => {
  it.each([
    ["  LocalHost:3000  ", "localhost:3000"],
    ["HTTPS://POS.Example.com/till?x=1#a", "pos.example.com"],
    ["http://localhost:8080/app", "localhost:8080"],
    ["localhost:03000", "localhost:3000"],
    ["localhost", "localhost"],
    ["192.168.0.10:8080", "192.168.0.10:8080"],
    ["0.0.0.0", "0.0.0.0"],
    ["a-b.example.co.uk", "a-b.example.co.uk"],
    ["https://a.com:443/x", "a.com"],
    ["http://a.com:80", "a.com"],
    ["https://a.com:8443", "a.com:8443"],
    ["http://a.com:443", "a.com:443"],
    ["a.com:443", "a.com:443"],
  ])("normalises %s", (input, expected) => {
    expect(normaliseHost(input)).toBe(expected);
    expect(isValidHost(input)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "local host",
    "a..b",
    ".example.com",
    "-a.com",
    "a_b.com",
    "user@host",
    "localhost:",
    "localhost:0",
    "localhost:65536",
    "localhost:abc",
    "[::1]:3000",
    "::1",
    "256.1.1.1",
    "1e2.2.3.4",
    "example.0xff",
    "127.0.0.0x1",
    "1.2.3",
    "01.2.3.4",
    "bücher.de",
    `${"a".repeat(64)}.com`,
    Array(51).fill("abcde").join("."),
  ])("rejects %s", (input) => {
    expect(normaliseHost(input)).toBeNull();
    expect(isValidHost(input)).toBe(false);
  });
});

describe("hostOfUrl", () => {
  it.each([
    ["http://LOCALHOST:3000/x", "localhost:3000"],
    ["https://a.com:443/", "a.com"],
    ["chrome://extensions", null],
    ["file:///x", null],
    ["about:blank", null],
    ["not a url", null],
  ])("%s", (url, expected) => {
    expect(hostOfUrl(url)).toBe(expected);
  });
});

describe("isAllowed", () => {
  const sites = ["localhost:3000", "pos.example.com"];
  it.each([
    ["http://localhost:3000/a", true],
    ["http://localhost:3001/", false],
    ["http://localhost/", false],
    ["https://pos.example.com/x", true],
    ["https://sub.pos.example.com/", false],
    ["https://example.com/", false],
    ["chrome://newtab", false],
  ])("matches exact host[:port] only: %s", (url, expected) => {
    expect(isAllowed(url, sites)).toBe(expected);
  });
});

describe("withSite", () => {
  it("appends a new host and leaves an existing one", () => {
    const sites = ["a.test"];
    const added = withSite(sites, "b.test");
    expect(added).toEqual(["a.test", "b.test"]);
    expect(added).not.toBe(sites);
    const same = withSite(sites, "a.test");
    expect(same).toEqual(["a.test"]);
    expect(same).not.toBe(sites);
  });
});

describe("withoutSite", () => {
  it("removes only that host", () => {
    expect(withoutSite(["a.test", "b.test"], "a.test")).toEqual(["b.test"]);
    expect(withoutSite(["a.test"], "c.test")).toEqual(["a.test"]);
  });
});
