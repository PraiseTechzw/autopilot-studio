import { describe, expect, it } from "vitest";
import { decryptGitHubToken, encryptGitHubToken } from "./githubAuth";

describe("GitHub token encryption", () => {
  it("round-trips a token using authenticated encryption rather than persisting it in plaintext", () => {
    const token = "ghu_example_sensitive_token";
    const ciphertext = encryptGitHubToken(token);
    expect(ciphertext).not.toContain(token);
    expect(ciphertext.split(".")).toHaveLength(3);
    expect(decryptGitHubToken(ciphertext)).toBe(token);
  });
});
