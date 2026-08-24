import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  decryptGitHubToken: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./githubAuth", () => ({ decryptGitHubToken: mocks.decryptGitHubToken }));

import { setSelectedGitHubRepositories } from "./githubRepositories";

describe("GitHub selected repository synchronization", () => {
  beforeEach(() => vi.resetAllMocks());

  it("stores a selected repository and its protected default-branch posture from the GitHub read-only endpoint", async () => {
    const selection = { id: 5, userId: 2, githubRepositoryId: "100", fullName: "acme/console", defaultBranch: "main", selected: false, branchProtectionStatus: "unavailable" };
    const updates: unknown[] = [];
    const query = (rows: unknown[]) => ({ limit: vi.fn().mockResolvedValue(rows), then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) });
    const db = {
      select: vi.fn().mockReturnValue({ from: vi.fn((table: { [key: string]: unknown }) => ({ where: vi.fn(() => table.tokenCiphertext ? query([{ id: 1, status: "connected", tokenCiphertext: "ciphertext" }]) : query([selection])) })) }),
      update: vi.fn().mockReturnValue({ set: vi.fn((values: unknown) => ({ where: vi.fn(async () => { updates.push(values); }) })) }),
    };
    mocks.getDb.mockResolvedValue(db);
    mocks.decryptGitHubToken.mockReturnValue("token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ required_pull_request_reviews: {} }) }));

    await setSelectedGitHubRepositories(2, ["100"]);

    expect(fetch).toHaveBeenCalledWith("https://api.github.com/repos/acme/console/branches/main/protection", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token" }) }));
    expect(updates).toContainEqual(expect.objectContaining({ selected: true, branchProtectionStatus: "protected" }));
    expect(updates).toContainEqual(expect.objectContaining({ selectedRepositoryIds: JSON.stringify(["100"]) }));
  });
});
