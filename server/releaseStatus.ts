import { getConnectedGitHubToken } from "./githubRepositories";

const repository = "PraiseTechzw/autopilot-studio";
const version = "1.0.0";
const tag = `companion-v${version}`;
const platformFiles = [
  `autopilot-companion-${version}-darwin-node20.tar.gz`,
  `autopilot-companion-${version}-linux-node20.tar.gz`,
  `autopilot-companion-${version}-windows-node20.zip`,
] as const;
const integrityFiles = ["manifest.json", "SHA256SUMS"] as const;
const requiredFiles = [...platformFiles, ...integrityFiles, ...platformFiles.map(file => `${file}.sigstore.json`), ...integrityFiles.map(file => `${file}.sigstore.json`)];

type GitHubAsset = { name?: unknown; browser_download_url?: unknown; size?: unknown; state?: unknown };
type GitHubRelease = { tag_name?: unknown; draft?: unknown; prerelease?: unknown; published_at?: unknown; html_url?: unknown; body?: unknown; assets?: unknown };

function asAsset(value: GitHubAsset) {
  return typeof value.name === "string" && typeof value.browser_download_url === "string" && typeof value.size === "number" && value.size >= 0 && value.state === "uploaded"
    ? { name: value.name, downloadUrl: value.browser_download_url, size: value.size }
    : null;
}

export async function getCompanionReleaseStatus(userId: number) {
  const checkedAt = new Date();
  const token = await getConnectedGitHubToken(userId);
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "Autopilot-Studio", "X-GitHub-Api-Version": "2026-03-10" },
  });
  if (response.status === 404) return { state: "pending" as const, repository, tag, version, checkedAt, assets: [], releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`, notes: null };
  if (!response.ok) throw new Error("GitHub release status is temporarily unavailable.");
  const release = await response.json() as GitHubRelease;
  const assets = Array.isArray(release.assets) ? release.assets.map(item => asAsset(item as GitHubAsset)).filter((item): item is NonNullable<typeof item> => Boolean(item)) : [];
  const assetsByName = new Map(assets.map(asset => [asset.name, asset]));
  const publicationMatches = release.tag_name === tag && release.draft === false && release.prerelease === false && typeof release.published_at === "string";
  const complete = publicationMatches && requiredFiles.every(file => assetsByName.has(file));
  return {
    state: complete ? "available" as const : "incomplete" as const,
    repository,
    tag,
    version,
    checkedAt,
    releaseUrl: typeof release.html_url === "string" ? release.html_url : `https://github.com/${repository}/releases/tag/${tag}`,
    notes: typeof release.body === "string" ? release.body.slice(0, 4000) : null,
    assets: platformFiles.map(name => assetsByName.get(name)).filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}
