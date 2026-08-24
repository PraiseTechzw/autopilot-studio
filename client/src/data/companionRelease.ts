export const companionRelease = {
  version: "1.0.0",
  tag: "companion-v1.0.0",
  repository: "PraiseTechzw/autopilot-studio",
  published: false,
  workflowIdentity: "^https://github\\.com/PraiseTechzw/autopilot-studio/\\.github/workflows/release-companion\\.yml@refs/tags/companion-v[0-9]+\\.[0-9]+\\.[0-9]+$",
  assets: [
    { platform: "macOS", file: "autopilot-companion-1.0.0-darwin-node20.tar.gz", install: "tar -xzf autopilot-companion-1.0.0-darwin-node20.tar.gz && cd autopilot-companion-1.0.0-node20" },
    { platform: "Linux", file: "autopilot-companion-1.0.0-linux-node20.tar.gz", install: "tar -xzf autopilot-companion-1.0.0-linux-node20.tar.gz && cd autopilot-companion-1.0.0-node20" },
    { platform: "Windows", file: "autopilot-companion-1.0.0-windows-node20.zip", install: "Expand-Archive .\\autopilot-companion-1.0.0-windows-node20.zip; cd .\\autopilot-companion-1.0.0-node20" },
  ],
  notes: [
    "Signed local status receipts now separate current policy acknowledgement from fresh local posture.",
    "The pairing wizard guides a device through policy confirmation and a first metadata-only status check.",
    "Published bundles are reproducible source packages with checksums, GitHub provenance, and keyless Sigstore bundles.",
  ],
} as const;

export const releaseBaseUrl = `https://github.com/${companionRelease.repository}/releases/download/${companionRelease.tag}`;
export const releasePageUrl = `https://github.com/${companionRelease.repository}/releases/tag/${companionRelease.tag}`;
