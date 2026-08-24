# Vercel deployment

Autopilot Studio runs as a single Vercel Node function backed by the Vite client build. The repository’s `vercel.json` runs `pnpm build`, bundles the complete Express dependency graph into `dist/vercel.js`, includes `dist/public`, and routes requests through the stable `api/index.js` function entrypoint. This prevents serverless runtime imports from resolving source-only TypeScript modules and preserves tRPC, OAuth, GitHub callback, Companion HTTP, and SPA fallback routes without opening a persistent port.

## GitHub integration

The Vercel project is linked to `PraiseTechzw/autopilot-studio` on the `main` branch. A new GitHub commit creates a Vercel deployment. The production alias should serve the Vite application—not a JavaScript server bundle—before it is shared with users.

## Required environment variables

Add the variable **names** in [`.env.vercel.example`](../.env.vercel.example) to Vercel Project Settings for **Production** and **Preview** as appropriate. Copy values only from the existing secure secret store; never add `.env` files to Git.

| Group | Variables | Notes |
| --- | --- | --- |
| Core server | `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` | `DATABASE_URL` must be reachable from Vercel. Generate a high-entropy production-only `JWT_SECRET`. |
| GitHub OAuth | `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEY` | The encryption key must remain stable or previously stored OAuth tokens cannot be decrypted. |
| Optional Forge-backed features | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Required for the Studio features that call the Manus Forge service. |
| Browser configuration | `VITE_OAUTH_PORTAL_URL`, `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY` | These values are embedded in the Vite client; do not put privileged credentials here. |

## OAuth and callback URLs

Before using production sign-in or GitHub connection, register the chosen Vercel production URL in the relevant OAuth provider configuration. The application expects these callback paths:

```text
https://YOUR-VERCEL-DOMAIN/api/oauth/callback
https://YOUR-VERCEL-DOMAIN/api/github/callback
```

Use a stable custom domain or the production alias rather than a temporary preview URL. GitHub OAuth derives its callback origin from the request host, so the provider’s allowed callback configuration must match exactly.

## Release checklist

1. Configure every required production environment variable in Vercel without exposing the value in source control.
2. Confirm the Vercel build log runs `pnpm build` and emits `dist/public`.
3. Verify `/`, `/download`, `/api/trpc`, `/api/oauth/callback`, and `/api/github/callback` against the production alias.
4. Confirm browser session cookies are `Secure` over HTTPS and test a complete sign-in flow.
5. Do not enable public Companion downloads until the separate GitHub release workflow has actually created signed assets and provenance.
