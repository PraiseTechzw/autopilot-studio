import { describe, expect, it } from "vitest";

describe("GitHub App credentials", () => {
  it("authenticate against GitHub's application credential endpoint", async () => {
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

    expect(clientId).toBeTruthy();
    expect(clientSecret).toBeTruthy();

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: "autopilot-credential-validation-intentionally-invalid",
      }),
    });
    const payload = await response.json() as { error?: string };

    expect(response.status).toBe(200);
    expect(payload.error).toBe("bad_verification_code");
  }, 15_000);
});
