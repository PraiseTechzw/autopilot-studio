# Autopilot Studio

Autopilot Studio is a **local-first Git automation control plane**. It keeps repository inspection, file watching, and Git execution on a paired local Companion device. The web application manages policy, approvals, visibility, and metadata-only audit records; it does not receive source code, diffs, file names, local paths, remote URLs, or Git credentials.

## What is included

| Surface | Purpose | Boundary |
| --- | --- | --- |
| Studio dashboard | Policies, approvals, monitoring, device lifecycle, and opt-in alerts | Metadata and preferences only |
| Companion CLI | Local inspection, signed policy receipt verification, approval-gated commit or separately approved push | Runs locally; dry-run default |
| GitHub integration | Selected repository metadata and default-branch protection posture | Read-only; no content or write permission |
| Release workflow | Deterministic Companion bundles, SHA-256 checksums, keyless Sigstore bundles, and GitHub provenance | No stored private signing key |

## Quick start

Use Node.js 20 or newer. Install workspace dependencies, start Studio, sign in, and follow **Guided setup** to configure the GitHub App, select repository visibility, create a one-time pairing code, and confirm the first policy receipt.

```bash
pnpm install
pnpm dev
```

After pairing, the Companion remains local to the developer machine:

```bash
pnpm companion pair https://YOUR-STUDIO-URL YOUR_ONE_TIME_PAIRING_CODE "Laptop"
pnpm companion status --repo /path/to/repository --repository-id 12
pnpm companion run --repo /path/to/repository --repository-id 12 --message "feat: reviewed local change" --dry-run
```

`--dry-run` never stages, commits, or pushes. A commit requires a dedicated approval. Adding `--push` requests a separate approval after the local commit; a push is never implicit.

## Download and verify the Companion

Public release assets are published from tags named `companion-v<version>`. The download page exposes actions only after Studio verifies the complete expected asset set: macOS, Linux, and Windows bundles, `manifest.json`, `SHA256SUMS`, and each matching keyless Sigstore bundle.

```bash
shasum -a 256 -c SHA256SUMS
cosign verify-blob --bundle <asset>.sigstore.json \
  --certificate-identity-regexp 'https://github.com/PraiseTechzw/autopilot-studio/.github/workflows/release-companion.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com <asset>
gh attestation verify <asset> -R PraiseTechzw/autopilot-studio
```

See the [Companion guide](companion/README.md) for installation, status reporting, local safety stops, watch mode, and configuration. See [SECURITY.md](SECURITY.md) before reporting a vulnerability.

## Development and release

```bash
pnpm test
pnpm check
pnpm companion:package
pnpm companion:verify-release
```

`pnpm companion:package` creates deterministic **unsigned development artifacts** only. A GitHub Actions release run is required to publish signed assets and provenance. The release workflow is defined in [`.github/workflows/release-companion.yml`](.github/workflows/release-companion.yml).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for development, testing, and pull-request expectations. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is released under the [MIT License](LICENSE).
