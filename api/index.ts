import "dotenv/config";
import { createStudioApp } from "../server/_core/app";
import { serveStatic } from "../server/_core/vite";

// Vercel invokes this Express application as one Node serverless function.
// vercel.json rewrites all paths here; static Vite output is bundled with the
// function and API routes retain their /api/* paths.
const app = createStudioApp();
serveStatic(app, process.cwd() + "/dist/public");

export default app;
