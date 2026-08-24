import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { deriveOAuthFeedback } from "@shared/setupFlow";
import { Check, CircleAlert, CircleCheck, Copy, Github, KeyRound, Laptop, LockKeyhole, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

function formatTime(value?: Date | string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Not yet";
}

export default function Integrations() {
  const { isAuthenticated } = useAuth();
  const dashboard = trpc.studio.dashboard.useQuery(undefined, { enabled: isAuthenticated });
  const connection = trpc.github.connection.useQuery(undefined, { enabled: isAuthenticated });
  const repositoryCatalog = trpc.github.repositories.useQuery(undefined, { enabled: isAuthenticated && Boolean(connection.data) });
  const utils = trpc.useUtils();
  const [oauthNotice, setOauthNotice] = useState<"authorizing" | "connected" | "cancelled" | "rejected" | "expired" | "error" | null>(null);
  const beginAuthorization = trpc.github.beginAuthorization.useMutation({
    onMutate: () => { sessionStorage.setItem("autopilot-github-authorizing", "1"); setOauthNotice("authorizing"); },
    onSuccess: result => window.location.assign(result.authorizationUrl),
    onError: error => { setOauthNotice("error"); toast.error("GitHub connection could not start", { description: error.message }); },
  });
  const createPairing = trpc.companion.createPairing.useMutation();
  const refreshRepositories = trpc.github.refreshRepositories.useMutation({
    onSuccess: () => { utils.github.repositories.invalidate(); toast.success("GitHub repository metadata refreshed"); },
    onError: error => toast.error("Repository refresh could not complete", { description: error.message }),
  });
  const setSelectedRepositories = trpc.github.setSelectedRepositories.useMutation({
    onSuccess: () => { utils.github.repositories.invalidate(); utils.github.connection.invalidate(); toast.success("Selected repository scope saved"); },
    onError: error => toast.error("Repository scope could not be saved", { description: error.message }),
  });
  const [pairingOpen, setPairingOpen] = useState(false);
  const [label, setLabel] = useState("My local companion");
  const [pairing, setPairing] = useState<{ pairingCode: string; expiresAt: Date } | null>(null);
  const callbackUrl = `${window.location.origin}/api/github/callback`;

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("github");
    if (result && ["connected", "cancelled", "rejected", "expired", "error"].includes(result)) {
      setOauthNotice(result as "connected" | "cancelled" | "rejected" | "expired" | "error");
      sessionStorage.removeItem("autopilot-github-authorizing");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (sessionStorage.getItem("autopilot-github-authorizing")) setOauthNotice("authorizing");
  }, []);

  const startPairing = () => {
    createPairing.mutate({ label }, {
      onSuccess: result => { setPairing({ pairingCode: result.pairingCode, expiresAt: result.expiresAt }); setPairingOpen(true); },
      onError: error => toast.error("Pairing code could not be created", { description: error.message }),
    });
  };

  const copyPairing = async () => {
    if (!pairing) return;
    await navigator.clipboard.writeText(pairing.pairingCode);
    toast.success("Pairing code copied");
  };

  const devices = dashboard.data?.devices ?? [];
  const selectedRepositoryIds = (repositoryCatalog.data ?? []).filter((repository: any) => repository.selected).map((repository: any) => repository.githubRepositoryId);
  const toggleRepositorySelection = (repositoryId: string) => {
    const selected = selectedRepositoryIds.includes(repositoryId)
      ? selectedRepositoryIds.filter((id: string) => id !== repositoryId)
      : [...selectedRepositoryIds, repositoryId];
    setSelectedRepositories.mutate({ repositoryIds: selected });
  };
  return <div className="mx-auto max-w-[1180px] space-y-5">
    <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#82949a]">Integrations / Local trust boundary</p><h1 className="mt-2 text-2xl font-extrabold tracking-[-0.055em] text-white sm:text-[30px]">Connections with clear limits.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#9faeaf]">GitHub visibility is read-only and repository-scoped. Your companion is paired to a device, not a browser session, and still executes Git locally.</p></div><Badge variant="outline" className="w-fit gap-1.5 rounded-full border-[#b7f05a]/25 bg-[#b7f05a]/[0.07] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#c9f784]"><LockKeyhole className="h-3 w-3" />No source upload</Badge></header>

    <OAuthFeedback notice={oauthNotice} connectionStatus={connection.data?.status} onRetry={() => beginAuthorization.mutate()} loading={beginAuthorization.isPending} />

    <section className="grid gap-5 lg:grid-cols-[1.12fr_0.88fr]"><div className="rounded-[24px] border border-white/[0.09] bg-[#101820]/80 p-6"><div className="flex items-start justify-between gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#d5b7ff]/10 text-[#d5b7ff]"><Github className="h-5 w-5" /></div><Badge variant="outline" className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${connection.data?.status === "connected" ? "border-[#b7f05a]/30 bg-[#b7f05a]/10 text-[#c9f784]" : "border-white/[0.12] text-[#92a4a4]"}`}>{connection.data?.status === "connected" ? "Connected" : "Not connected"}</Badge></div><h2 className="mt-5 text-xl font-bold tracking-[-0.05em] text-white">GitHub App visibility</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#9baeb0]">Autopilot requests selected-repository visibility only: <strong className="font-semibold text-[#dce8e2]">Metadata: read</strong> and <strong className="font-semibold text-[#dce8e2]">Administration: read</strong> to inspect branch protection. It cannot read repository contents, write code, change protection, create webhooks, or manage organization settings.</p><div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0b1116]/60 p-3"><p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#778b90]">GitHub App callback URL</p><code className="mt-2 block break-all text-[11px] text-[#d7e7e0]">{callbackUrl}</code><p className="mt-2 text-[11px] leading-5 text-[#82969a]">Paste this exact URL into the GitHub App’s callback field before connecting. If you publish Studio on a different domain, update the GitHub App callback to that domain first.</p></div>{connection.data ? <div className="mt-5 rounded-xl border border-[#b7f05a]/15 bg-[#b7f05a]/[0.05] p-4"><div className="flex items-center gap-3"><Check className="h-4 w-4 text-[#bdf26a]" /><div><p className="text-sm font-semibold text-white">Connected as @{connection.data.login}</p><p className="mt-1 text-xs text-[#95a9a8]">Token status: {connection.data.status}. Stored encrypted server-side.</p></div></div></div> : <Button onClick={() => beginAuthorization.mutate()} disabled={beginAuthorization.isPending || !isAuthenticated} className="mt-5 rounded-xl bg-[#b7f05a] text-xs font-bold text-[#121a0c] hover:bg-[#c8f87a]">{beginAuthorization.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Github className="mr-1.5 h-3.5 w-3.5" />}Connect selected GitHub repositories</Button>}</div>
      <aside className="rounded-[24px] border border-white/[0.09] bg-[#101820]/75 p-6"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#778b90]">Permission receipt</p><h2 className="mt-2 text-lg font-bold tracking-[-0.045em] text-white">What Studio may observe</h2><div className="mt-5 space-y-3"><Permission label="Repository metadata" description="Names, identifiers, and default branch" /><Permission label="Administration metadata" description="Branch-protection posture only" /><Permission label="Explicitly excluded" description="Contents, writes, hooks, organization access" muted /></div></aside></section>

    {connection.data && <section className="rounded-[24px] border border-white/[0.09] bg-[#101820]/80 p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#778b90]">Selected GitHub repositories</p><h2 className="mt-2 text-xl font-bold tracking-[-0.05em] text-white">Limit visibility to what you choose.</h2><p className="mt-2 text-sm leading-6 text-[#9baeb0]">Select repositories to retain their identity and default-branch protection posture. Studio never stores file trees, commits, diffs, or source contents.</p></div><Button onClick={() => refreshRepositories.mutate()} disabled={refreshRepositories.isPending} variant="outline" className="h-9 rounded-xl border-white/[0.1] bg-white/[0.02] text-xs text-white hover:bg-white/[0.08]"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshRepositories.isPending ? "animate-spin" : ""}`} />Refresh catalog</Button></div>{repositoryCatalog.data?.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{repositoryCatalog.data.map((repository: any) => <button key={repository.id} onClick={() => toggleRepositorySelection(repository.githubRepositoryId)} disabled={setSelectedRepositories.isPending} className={`rounded-2xl border p-4 text-left transition-colors ${repository.selected ? "border-[#b7f05a]/35 bg-[#b7f05a]/[0.07]" : "border-white/[0.08] bg-[#0b1116]/50 hover:border-white/[0.16]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{repository.fullName}</p><p className="mt-1 font-mono text-[10px] text-[#819498]">DEFAULT / {repository.defaultBranch}</p></div><Badge variant="outline" className={`rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${repository.selected ? "border-[#b7f05a]/30 text-[#c9f784]" : "border-white/[0.12] text-[#839598]"}`}>{repository.selected ? "Selected" : "Not selected"}</Badge></div><div className="mt-4 flex items-center gap-2 text-[11px] text-[#93a6a7]"><ShieldCheck className={`h-3.5 w-3.5 ${repository.branchProtectionStatus === "protected" ? "text-[#bdf26a]" : repository.branchProtectionStatus === "unprotected" ? "text-[#ffc17e]" : "text-[#93a6a7]"}`} />Branch protection: {repository.branchProtectionStatus}</div></button>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-white/[0.12] bg-[#0b1116]/45 p-5"><p className="text-sm font-semibold text-white">No repository metadata is available yet</p><p className="mt-1 text-xs leading-5 text-[#879a9d]">Use Refresh catalog after installing the GitHub App on at least one selected repository.</p></div>}</section>}

    <section className="rounded-[24px] border border-white/[0.09] bg-[#101820]/80 p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#778b90]">Companion devices</p><h2 className="mt-2 text-xl font-bold tracking-[-0.05em] text-white">Pair a local executor.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#9baeb0]">A pairing code creates a device-specific credential. The companion submits signed metadata, verifies policy snapshots, and never sends source files or local Git credentials to Studio.</p></div><div className="flex gap-2"><Input value={label} onChange={event => setLabel(event.target.value)} className="h-9 w-44 border-white/[0.1] bg-[#0a1015] text-xs text-white focus-visible:ring-[#b7f05a]" aria-label="Companion label" /><Button onClick={startPairing} disabled={createPairing.isPending || !isAuthenticated} className="h-9 rounded-xl bg-white/[0.09] text-xs text-white hover:bg-white/[0.15]">{createPairing.isPending ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}Pair device</Button></div></div>{devices.length ? <div className="mt-6 grid gap-3 md:grid-cols-2">{devices.map((device: any) => <div key={device.id} className="rounded-2xl border border-white/[0.08] bg-[#0b1116]/55 p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#8cc5ff]/10 text-[#9bcfff]"><Laptop className="h-4 w-4" /></div><div><p className="text-sm font-semibold text-white">{device.label}</p><p className="mt-1 font-mono text-[10px] text-[#7d9096]">{device.deviceId.slice(0, 16)}…</p></div></div><Badge variant="outline" className="rounded-full border-[#b7f05a]/25 bg-[#b7f05a]/[0.07] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#c9f784]">{device.status}</Badge></div><p className="mt-4 text-xs text-[#92a5a6]">Last confirmed: {formatTime(device.lastSeenAt)}</p></div>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-white/[0.12] bg-[#0b1116]/45 p-6"><KeyRound className="h-5 w-5 text-[#bdf26a]" /><p className="mt-3 text-sm font-semibold text-white">No local companion is paired</p><p className="mt-1 text-xs leading-5 text-[#879a9d]">Create a short-lived pairing code, paste it into the companion setup command, and remove it from view once registration completes.</p></div>}</section>

    <Dialog open={pairingOpen} onOpenChange={setPairingOpen}><DialogContent className="border-white/[0.12] bg-[#101820] text-white sm:max-w-[540px]"><DialogHeader><DialogTitle className="text-xl font-extrabold tracking-[-0.05em]">One-time companion pairing code</DialogTitle><DialogDescription className="leading-6 text-[#92a4a5]">This code expires at {formatTime(pairing?.expiresAt)} and is consumed once. Copy it directly into a local companion setup command; do not paste it into source control or a shared chat.</DialogDescription></DialogHeader><div className="rounded-xl border border-[#b7f05a]/20 bg-[#0b1116]/75 p-4"><code className="block break-all font-mono text-xs leading-6 text-[#dff8a5]">{pairing?.pairingCode}</code></div><DialogFooter><Button variant="ghost" onClick={() => setPairingOpen(false)} className="text-[#9aadae] hover:bg-white/[0.06] hover:text-white">Close</Button><Button onClick={copyPairing} className="rounded-xl bg-[#b7f05a] text-xs font-bold text-[#121a0c] hover:bg-[#c8f87a]"><Copy className="mr-1.5 h-3.5 w-3.5" />Copy code</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Permission({ label, description, muted = false }: { label: string; description: string; muted?: boolean }) { return <div className={`rounded-xl border p-3 ${muted ? "border-[#ffbc7d]/15 bg-[#ffbc7d]/[0.04]" : "border-white/[0.08] bg-white/[0.025]"}`}><div className="flex items-center gap-2"><ShieldCheck className={`h-3.5 w-3.5 ${muted ? "text-[#ffc17e]" : "text-[#bdf26a]"}`} /><p className="text-xs font-semibold text-white">{label}</p></div><p className="mt-1.5 pl-5 text-[11px] leading-5 text-[#8d9fa1]">{description}</p></div>; }

export function OAuthFeedback({ notice, connectionStatus, onRetry, loading }: { notice: "authorizing" | "connected" | "cancelled" | "rejected" | "expired" | "error" | null; connectionStatus?: string; onRetry: () => void; loading: boolean }) {
  const state = deriveOAuthFeedback(notice, connectionStatus);
  if (!state) return null;
  const content = state === "authorizing" ? { icon: RefreshCw, title: "Waiting for GitHub authorization", body: "Complete the secure GitHub App screen in the tab that opened. Studio will return here when the callback is verified.", className: "border-[#8cc5ff]/25 bg-[#8cc5ff]/[0.06] text-[#b3d9ff]" } : state === "connected" ? { icon: CircleCheck, title: "GitHub authorization confirmed", body: "Your encrypted token is stored server-side. Select repository visibility next.", className: "border-[#b7f05a]/25 bg-[#b7f05a]/[0.06] text-[#c9f784]" } : state === "rejected" ? { icon: CircleAlert, title: "GitHub authorization was rejected", body: "GitHub did not grant the requested App authorization. No token was stored and no repository visibility changed.", className: "border-[#ff8e9b]/25 bg-[#ff8e9b]/[0.06] text-[#ffc0c8]" } : state === "cancelled" ? { icon: CircleAlert, title: "GitHub authorization was cancelled", body: "No token was stored and no repository visibility changed. You can safely try again.", className: "border-[#ffbc7d]/25 bg-[#ffbc7d]/[0.06] text-[#ffd1a8]" } : state === "expired" ? { icon: CircleAlert, title: "GitHub authorization expired", body: "The one-time authorization state is no longer valid. Start a new connection attempt.", className: "border-[#ffbc7d]/25 bg-[#ffbc7d]/[0.06] text-[#ffd1a8]" } : { icon: CircleAlert, title: "GitHub needs attention", body: "Authorization did not complete safely, or the saved connection needs to be refreshed. No source data was transferred.", className: "border-[#ff8e9b]/25 bg-[#ff8e9b]/[0.06] text-[#ffc0c8]" };
  const Icon = content.icon;
  const retry = state === "cancelled" || state === "rejected" || state === "expired" || state === "error";
  return <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${content.className}`}><div className="flex items-start gap-3"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${state === "authorizing" ? "animate-spin" : ""}`} /><div><p className="text-sm font-semibold text-white">{content.title}</p><p className="mt-1 text-xs leading-5 text-[#b6c5c4]">{content.body}</p></div></div>{retry && <Button onClick={onRetry} disabled={loading} variant="outline" className="h-8 rounded-xl border-white/[0.15] bg-white/[0.05] text-xs text-white hover:bg-white/[0.1]">{loading ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Github className="mr-1.5 h-3.5 w-3.5" />}Retry connection</Button>}</div>;
}
