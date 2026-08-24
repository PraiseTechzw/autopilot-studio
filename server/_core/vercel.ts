import "dotenv/config";
import { createStudioApp } from "./app";
import { serveStatic } from "./static";

// This module is bundled by esbuild into dist/vercel.js during `pnpm build`.
// Keeping the full server graph in one emitted ESM file prevents Vercel's
// function tracer from resolving source-only TypeScript imports at runtime.
const app = createStudioApp();
serveStatic(app);

export default app;
