# Autopilot Companion Reference CLI

This reference CLI establishes the local protocol boundary. It can pair a device, verify a device-bound policy receipt, submit a metadata-only candidate action, and record an execution receipt. It intentionally does **not** watch files or execute Git commands; a production executor must add those local steps only after successful policy verification and an approved, unexpired decision.

```bash
node companion/autopilot-companion.mjs pair https://YOUR-STUDIO-URL YOUR_ONE_TIME_PAIRING_CODE "Laptop"
node companion/autopilot-companion.mjs policy 12
node companion/autopilot-companion.mjs queue 12 commit feature/login 4 low "Add metadata-only login telemetry"
node companion/autopilot-companion.mjs decision ACTION_ID PAYLOAD_DIGEST POLICY_DIGEST
node companion/autopilot-companion.mjs receipt ACTION_ID PAYLOAD_DIGEST completed COMMIT_HASH
```

The CLI saves its device token and private key to `~/.config/autopilot-studio/companion.json` with owner-only file permissions. Never commit this file or a pairing code.

Only run a local Git executor after `decision` returns `approved`. A pending, rejected, expired, changed-payload, or changed-policy response is an execution block.
