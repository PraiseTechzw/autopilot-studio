# Companion Observability and Distribution Design

## Signed status receipt

The executable companion will submit a device-signed status receipt only after it has locally verified and acknowledged the current policy receipt. The receipt records **repository and policy identifiers, policy revision and digest, branch name, high-level safety result, safety reasons, changed-file counts, eligible-file counts, CLI version, and observation time**. It deliberately excludes file names, diffs, source contents, remote URLs, and credentials.

Studio will validate device ownership, repository ownership, a current matching policy revision and digest, request signature, replay nonce, and bounded status fields before persistence. The monitoring view will treat a policy as visually synchronized only when the latest device status is signed, policy-current, and fresh.

## Pairing journey

The setup wizard will expose the exact installed CLI command, short-lived pairing code, and a post-pairing status command. It will show a meaningful terminal-to-dashboard handoff: **code created → device registered → policy receipt acknowledged → signed status visible**. A user may inspect this flow without enabling local Git execution.

## Distribution and trust model

Release packaging will create versioned source bundles for macOS, Linux, and Windows-compatible Node.js environments, each including the executable script, reference protocol client, local helper library, documentation, license, checksums, and a machine-readable manifest.

Releases use a **keyless signing workflow** in GitHub Actions. No private signing key is stored in the repository or in Studio. The release workflow requests a short-lived GitHub OIDC identity, signs every distributable blob with Sigstore Cosign, publishes a bundle beside each asset, and creates GitHub build provenance attestations. Consumers verify checksums, Cosign bundle identity, and GitHub provenance before running the CLI. GitHub’s documentation describes artifact attestations as cryptographically signed provenance claims; it also notes that consumers must verify and apply their own trust policy. [1] Sigstore documents keyless blob signing with a GitHub Actions OIDC identity and verification against the expected workflow identity and issuer. [2]

## Release prerequisites

The workflow remains inactive until a maintainer pushes a semantic version tag such as `companion-v1.0.0`. Before the first public release, the repository owner should review the workflow’s `contents: write`, `id-token: write`, and `attestations: write` permissions, enable GitHub Actions, and ensure the release repository is the intended distribution channel.

## References

[1] [GitHub Docs — Artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)

[2] [Sigstore Docs — CI quickstart](https://docs.sigstore.dev/quickstart/quickstart-ci/)
