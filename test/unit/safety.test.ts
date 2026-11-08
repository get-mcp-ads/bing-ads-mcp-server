import { describe, expect, it } from "vitest";
import { assertAllowedRequestUrl } from "../../src/hosts.js";
import { redactSecretFields, redactText } from "../../src/http.js";
import { assertSafeReportUrl, isPrivateOrLocalHost, isPublicHttpsUrl } from "../../src/safety.js";

describe("URL safety", () => {
  it("treats loopback, private, link-local, metadata and IP-literal hosts as unsafe", () => {
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "[::1]", "::1", "2130706433", "0x7f000001", "metadata.google.internal", "printer.local", "intranet"]) {
      expect(isPrivateOrLocalHost(host), host).toBe(true);
    }
    for (const host of ["cdn.example.com", "8.8.8.8", "172.32.0.1", "bingadsappsstorageprod.blob.core.windows.net"]) expect(isPrivateOrLocalHost(host), host).toBe(false);
  });
  it("accepts only HTTPS report links on Microsoft report hosts", () => {
    expect(assertSafeReportUrl("https://reporting.api.bingads.microsoft.com/r.zip").hostname).toBe("reporting.api.bingads.microsoft.com");
    expect(() => assertSafeReportUrl("https://user:pw@reporting.api.bingads.microsoft.com/r.zip")).toThrow();
    expect(() => assertSafeReportUrl("not a url")).toThrow();
    expect(isPublicHttpsUrl("https://cdn.example.com/v.mp4")).toBe(true);
    expect(isPublicHttpsUrl("https://cdn.example.com:8443/v.mp4")).toBe(false);
  });
  it("refuses requests outside the API and token hosts", () => {
    expect(() => assertAllowedRequestUrl("https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/Campaigns")).not.toThrow();
    expect(() => assertAllowedRequestUrl("https://login.microsoftonline.com/common/oauth2/v2.0/token")).not.toThrow();
    for (const url of ["https://example.com/", "http://campaign.api.bingads.microsoft.com/", "https://campaign.api.bingads.microsoft.com:444/", "https://campaign.api.bingads.microsoft.com.example.com/"]) {
      expect(() => assertAllowedRequestUrl(url), url).toThrow();
    }
  });
});

describe("redaction", () => {
  it("redacts credential keys at any depth and known secrets in text", () => {
    expect(redactSecretFields({ a: [{ refresh_token: "x", nested: { ClientSecret: "y", keep: 1 } }], AuthenticationToken: "z" }))
      .toEqual({ a: [{ refresh_token: "[REDACTED]", nested: { ClientSecret: "[REDACTED]", keep: 1 } }], AuthenticationToken: "[REDACTED]" });
    expect(redactText("value secret-123456 and secret-123456", ["secret-123456", undefined])).toBe("value [REDACTED] and [REDACTED]");
  });
});
