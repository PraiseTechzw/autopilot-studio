import type { Express, Request, Response } from "express";
import { appRouter } from "./routers";

async function invoke(request: Request, response: Response, method: (input: unknown) => Promise<unknown>, status = 200) {
  try {
    const result = await method(request.body);
    response.status(status).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Companion request could not be processed.";
    response.status(400).json({ error: message });
  }
}

export function registerCompanionHttpRoutes(app: Express) {
  app.post("/api/companion/register", async (request, response) => {
    const caller = appRouter.createCaller({ req: request as any, res: response as any, user: null });
    return invoke(request, response, input => caller.companion.register(input as any), 201);
  });
  app.post("/api/companion/policy", async (request, response) => {
    const caller = appRouter.createCaller({ req: request as any, res: response as any, user: null });
    return invoke(request, response, input => caller.companion.policy(input as any));
  });
  app.post("/api/companion/policy-confirmations", async (request, response) => {
    const caller = appRouter.createCaller({ req: request as any, res: response as any, user: null });
    return invoke(request, response, input => caller.companion.confirmPolicy(input as any));
  });
  app.post("/api/companion/status", async (request, response) => {
    const caller = appRouter.createCaller({ req: request as any, res: response as any, user: null });
    return invoke(request, response, input => caller.companion.submitStatus(input as any), 201);
  });
  app.post("/api/companion/actions", async (request, response) => {
    const caller = appRouter.createCaller({ req: request as any, res: response as any, user: null });
    return invoke(request, response, input => caller.companion.submitCandidate(input as any), 201);
  });
  app.post("/api/companion/decision", async (request, response) => {
    const caller = appRouter.createCaller({ req: request as any, res: response as any, user: null });
    return invoke(request, response, input => caller.companion.decision(input as any));
  });
  app.post("/api/companion/receipts", async (request, response) => {
    const caller = appRouter.createCaller({ req: request as any, res: response as any, user: null });
    return invoke(request, response, input => caller.companion.submitReceipt(input as any));
  });
}
