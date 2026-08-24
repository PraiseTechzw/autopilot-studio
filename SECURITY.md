# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability involving authentication, pairing, device credentials, release signing, policy enforcement, or data exposure. Use the repository’s private security-advisory reporting flow, or contact the project maintainer privately through the contact method listed on the repository profile.

Include a concise description, affected component and version, reproduction steps, potential impact, and any proposed mitigation. Do not include real pairing codes, tokens, private keys, local repository paths, source code, or Git credentials.

## Security boundaries

Autopilot Studio is designed so that local Companion devices execute Git locally. Studio stores policy, approval, device, and status metadata only. Each device uses a token hash and public key server-side; the device private key and local Git credentials remain on the device.

Companion device revocation blocks subsequent signed requests. Credential rotation revokes the old device credential before issuing a short-lived one-time replacement pairing code. Release verification requires checksums, keyless Sigstore bundles, and GitHub provenance for published assets.

## Supported versions

Security fixes are applied to the latest published Companion release and the current `main` branch.
