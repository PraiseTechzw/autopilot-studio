import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGitHubOAuthRoutes } from "../githubAuth";
import { registerCompanionHttpRoutes } from "../companionHttp";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";

/**
 * Creates the shared HTTP application used by local development, the Node
 * production server, and Vercel's serverless function. It deliberately does
 * not bind a port or attach static files; each host supplies that concern.
 */
export function createStudioApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerGitHubOAuthRoutes(app);
  registerCompanionHttpRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}
