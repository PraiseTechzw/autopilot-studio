import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { consumeGitHubOAuthState, createGitHubOAuthState, saveGitHubConnection } from "./companionDb";
import { syncGitHubRepositoryCatalog } from "./githubRepositories";

const githubAppPermissions = ["repository_metadata:read", "administration:read"] as const;

function getOrigin(request: Request) {
  const protocol = String(request.headers["x-forwarded-proto"] || request.protocol || "https").split(",")[0] || "https";
  const host = String(request.headers["x-forwarded-host"] || request.get("host") || "").split(",")[0];
  if (!host) throw new Error("A public host is required for GitHub authorization.");
  return `${protocol}://${host}`;
}

function requiredConfig() {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GitHub App credentials are not configured.");
  return { clientId, clientSecret };
}

function tokenKey() {
  const value = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("GitHub token encryption key is not configured.");
  return createHash("sha256").update(value).digest();
}

export function encryptGitHubToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map(value => value.toString("base64url")).join(".");
}

export function decryptGitHubToken(ciphertext: string) {
  const [ivValue, tagValue, encryptedValue] = ciphertext.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid GitHub token ciphertext.");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export async function createGitHubAuthorization(userId: number, request: Request) {
  const { clientId } = requiredConfig();
  const origin = getOrigin(request);
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const callbackUrl = `${origin}/api/github/callback`;
  const saved = await createGitHubOAuthState({
    userId,
    stateHash: createHash("sha256").update(state).digest("hex"),
    codeVerifier,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  if (!saved) throw new Error("GitHub authorization state could not be saved.");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUrl, state, code_challenge: codeChallenge, code_challenge_method: "S256" });
  return { authorizationUrl: `https://github.com/login/oauth/authorize?${params}`, callbackUrl, permissions: githubAppPermissions };
}

export async function handleGitHubCallback(request: Request, response: Response) {
  const error = typeof request.query.error === "string" ? request.query.error : undefined;
  const code = typeof request.query.code === "string" ? request.query.code : undefined;
  const state = typeof request.query.state === "string" ? request.query.state : undefined;
  if (error || !code || !state) {
    response.status(400).send("GitHub authorization was cancelled or did not return a code.");
    return;
  }
  const oauthState = await consumeGitHubOAuthState(createHash("sha256").update(state).digest("hex"));
  if (!oauthState) {
    response.status(400).send("This GitHub authorization request is expired or has already been used.");
    return;
  }
  try {
    const { clientId, clientSecret } = requiredConfig();
    const callbackUrl = `${getOrigin(request)}/api/github/callback`;
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl, code_verifier: oauthState.codeVerifier }),
    });
    const tokenPayload = await tokenResponse.json() as { access_token?: string; expires_in?: number; error?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(tokenPayload.error || "GitHub did not return an access token.");
    const userResponse = await fetch("https://api.github.com/user", { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${tokenPayload.access_token}`, "User-Agent": "Autopilot-Studio" } });
    const user = await userResponse.json() as { id?: number; login?: string };
    if (!userResponse.ok || !user.id || !user.login) throw new Error("GitHub user identity could not be read.");
    const saved = await saveGitHubConnection({
      userId: oauthState.userId,
      githubUserId: String(user.id),
      login: user.login,
      selectedRepositoryIds: "[]",
      grantedPermissions: JSON.stringify(githubAppPermissions),
      tokenCiphertext: encryptGitHubToken(tokenPayload.access_token),
      tokenExpiresAt: tokenPayload.expires_in ? new Date(Date.now() + tokenPayload.expires_in * 1000) : undefined,
      status: "connected",
    });
    if (!saved) throw new Error("GitHub connection could not be saved.");
    await syncGitHubRepositoryCatalog(oauthState.userId);
    response.redirect("/?github=connected");
  } catch (callbackError) {
    response.status(502).send(`GitHub authorization could not be completed: ${callbackError instanceof Error ? callbackError.message : "unknown error"}`);
  }
}

export function registerGitHubOAuthRoutes(app: { get: (path: string, handler: (request: Request, response: Response) => void | Promise<void>) => void }) {
  app.get("/api/github/callback", handleGitHubCallback);
}
