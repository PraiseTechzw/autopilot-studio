import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const root = process.cwd();
const releaseDirectory = join(root, "release");
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

describe("companion release packaging", () => {
  it("creates a deterministic source-only artifact set whose declared checksums verify", async () => {
    await rm(releaseDirectory, { recursive: true, force: true });
    await execute(process.execPath, ["scripts/package-companion.mjs"], { cwd: root });
    const firstLinuxBundle = await readFile(join(releaseDirectory, "autopilot-companion-1.0.0-linux-node20.tar.gz"));
    const sums = await readFile(join(releaseDirectory, "SHA256SUMS"), "utf8");
    expect(sums).toContain(`${sha256(firstLinuxBundle)}  autopilot-companion-1.0.0-linux-node20.tar.gz`);
    await execute(process.execPath, ["scripts/package-companion.mjs", "--verify"], { cwd: root });
    await execute(process.execPath, ["scripts/package-companion.mjs"], { cwd: root });
    expect(sha256(await readFile(join(releaseDirectory, "autopilot-companion-1.0.0-linux-node20.tar.gz")))).toBe(sha256(firstLinuxBundle));
  }, 30_000);
});
