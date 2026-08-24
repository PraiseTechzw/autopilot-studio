import { describe, expect, it } from "vitest";
import { githubReadOnlyPermissions } from "./githubRepositories";

describe("GitHub integration permissions", () => {
  it("requests only repository metadata and administration read visibility", () => {
    expect(githubReadOnlyPermissions).toEqual(["repository_metadata:read", "administration:read"]);
    expect(githubReadOnlyPermissions.join(" ")).not.toMatch(/contents|write|hooks|organization|pull_requests|checks|commit_statuses/);
  });
});
