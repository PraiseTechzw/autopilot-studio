import { describe, expect, it } from "vitest";
import { isWorkspaceManager } from "./companionDb";

describe("workspace manager role boundary", () => {
  it.each(["owner", "admin"] as const)("recognizes %s as a workspace manager", role => {
    expect(isWorkspaceManager(role)).toBe(true);
  });

  it.each(["reviewer", "member"] as const)("does not recognize %s as a workspace manager", role => {
    expect(isWorkspaceManager(role)).toBe(false);
  });
});
