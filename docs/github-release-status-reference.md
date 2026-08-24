# GitHub release-status reference

The authenticated download activation path is based on GitHub’s REST release endpoint documentation: <https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name>.

The endpoint is `GET /repos/{owner}/{repo}/releases/tags/{tag}`. It returns `200` for a published release and `404` when the tagged release is absent. The response includes publication state (`draft`, `prerelease`, `published_at`) and assets with `name`, `browser_download_url`, `state`, and `size` fields. Studio treats a release as available only when the expected tag is published, non-draft, non-prerelease, and contains every required bundle, integrity file, and Sigstore bundle. The request uses the existing encrypted server-side GitHub connection token and does not return that token to the client.

## Private repository provenance constraint

The `companion-v1.0.0` tag is in a private personal repository. GitHub’s `actions/attest` documentation states that artifact attestations are available for private or internal repositories only on GitHub Enterprise Cloud. The tag workflow therefore reached `startup_failure` before a job started; no release asset, signature bundle, or GitHub release was produced. This is a platform-plan constraint, not a failed local build. The same official guidance confirms that a public repository can use the public Sigstore instance and GitHub artifact attestations on all current GitHub plans. Sources: <https://docs.github.com/en/actions/concepts/security/artifact-attestations> and <https://github.com/actions/attest>.

After the repository became public, the first manual release run failed before a runner was allocated (`runner_id: 0` with no job steps or log blob). GitHub’s public status API reported Actions operational at the time of diagnosis: <https://www.githubstatus.com/api/v2/components.json>. A final controlled retry is appropriate before treating the condition as an account or repository-level blocker.
