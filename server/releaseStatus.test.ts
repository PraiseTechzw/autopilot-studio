import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getConnectedGitHubToken: vi.fn() }));
vi.mock("./githubRepositories", () => mocks);
import { getCompanionReleaseStatus } from "./releaseStatus";

const releaseUrl = "https://github.com/PraiseTechzw/autopilot-studio/releases/tag/companion-v1.0.0";
const baseFiles = ["autopilot-companion-1.0.0-darwin-node20.tar.gz", "autopilot-companion-1.0.0-linux-node20.tar.gz", "autopilot-companion-1.0.0-windows-node20.zip", "manifest.json", "SHA256SUMS"];
const signedFiles = [...baseFiles, ...baseFiles.map(file => `${file}.sigstore.json`)];

describe("companion release status", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); mocks.getConnectedGitHubToken.mockResolvedValue("encrypted-server-side-token"); });

  it("keeps downloads pending when the expected tagged release does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false }));
    mocks.getConnectedGitHubToken.mockResolvedValue("encrypted-server-side-token");
    await expect(getCompanionReleaseStatus(12)).resolves.toMatchObject({ state: "pending", tag: "companion-v1.0.0", assets: [] });
  });

  it("activates only a published non-prerelease whose complete asset and Sigstore-bundle set is uploaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ tag_name: "companion-v1.0.0", draft: false, prerelease: false, published_at: "2026-08-24T09:00:00Z", html_url: releaseUrl, body: "Signed companion release", assets: signedFiles.map((name, index) => ({ name, browser_download_url: `https://example.test/${name}`, state: "uploaded", size: index + 1 })) }) }));
    mocks.getConnectedGitHubToken.mockResolvedValue("encrypted-server-side-token");
    const status = await getCompanionReleaseStatus(12);
    expect(status).toMatchObject({ state: "available", releaseUrl });
    expect(status.assets[0]).toMatchObject({ name: "autopilot-companion-1.0.0-darwin-node20.tar.gz" });
  });

  it("does not activate a release with missing signature bundles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ tag_name: "companion-v1.0.0", draft: false, prerelease: false, published_at: "2026-08-24T09:00:00Z", html_url: releaseUrl, assets: baseFiles.map((name, index) => ({ name, browser_download_url: `https://example.test/${name}`, state: "uploaded", size: index + 1 })) }) }));
    mocks.getConnectedGitHubToken.mockResolvedValue("encrypted-server-side-token");
    await expect(getCompanionReleaseStatus(12)).resolves.toMatchObject({ state: "incomplete" });
  });

  it("does not call GitHub when the encrypted connected-token path is unavailable", async () => {
    mocks.getConnectedGitHubToken.mockRejectedValue(new Error("A connected GitHub App account is required."));
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(getCompanionReleaseStatus(12)).rejects.toThrow("connected GitHub App account is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
