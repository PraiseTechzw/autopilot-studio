import { describe, expect, it } from "vitest";
import { protectedBranchCoverage } from "../shared/protectedBranchCoverage";

describe("protectedBranchCoverage", () => {
  it("evaluates every repository against its own saved policy", () => {
    const result = protectedBranchCoverage(
      [
        { id: 1, defaultBranch: "main" },
        { id: 2, defaultBranch: "trunk" },
        { id: 3, defaultBranch: "main" },
      ],
      [
        { repositoryId: 1, protectedBranches: JSON.stringify(["main", "release"]) },
        { repositoryId: 2, protectedBranches: JSON.stringify(["main"]) },
        { repositoryId: 3, protectedBranches: JSON.stringify(["main"]) },
      ]
    );

    expect(result).toEqual({ covered: 2, total: 3, uncoveredRepositoryIds: [2] });
  });

  it("treats a missing or malformed policy as uncovered", () => {
    const result = protectedBranchCoverage(
      [{ id: 5, defaultBranch: "main" }],
      [{ repositoryId: 5, protectedBranches: "not-json" }]
    );

    expect(result).toEqual({ covered: 0, total: 1, uncoveredRepositoryIds: [5] });
  });
});
