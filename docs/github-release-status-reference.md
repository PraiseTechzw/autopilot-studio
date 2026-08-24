# GitHub release-status reference

The authenticated download activation path is based on GitHub’s REST release endpoint documentation: <https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name>.

The endpoint is `GET /repos/{owner}/{repo}/releases/tags/{tag}`. It returns `200` for a published release and `404` when the tagged release is absent. The response includes publication state (`draft`, `prerelease`, `published_at`) and assets with `name`, `browser_download_url`, `state`, and `size` fields. Studio treats a release as available only when the expected tag is published, non-draft, non-prerelease, and contains every required bundle, integrity file, and Sigstore bundle. The request uses the existing encrypted server-side GitHub connection token and does not return that token to the client.
