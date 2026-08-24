import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/** Serves a built Vite client without importing Vite at runtime. */
export function serveStatic(app: Express, staticDirectory?: string) {
  const distPath = staticDirectory
    ? path.resolve(staticDirectory)
    : process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
