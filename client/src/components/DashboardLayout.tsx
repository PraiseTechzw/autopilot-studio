import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  BellRing,
  Blocks,
  Bot,
  ChevronRight,
  CircleUserRound,
  Command,
  GitBranch,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "wouter";

const navigation = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: GitBranch, label: "Repositories", path: "/repositories" },
  { icon: ShieldCheck, label: "Policies", path: "/policies" },
  { icon: Blocks, label: "Extensions", path: "/extensions" },
  { icon: Activity, label: "Activity ledger", path: "/activity" },
  { icon: BellRing, label: "Alerts", path: "/alerts" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardFrame>{children}</DashboardFrame>
    </SidebarProvider>
  );
}

function DashboardFrame({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const [location, setLocation] = useLocation();

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-white/[0.07] bg-[#0b1218] text-[#d9e6df]">
        <SidebarHeader className="h-20 px-3 pt-4">
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleSidebar}
              aria-label="Toggle navigation"
              className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-[#b8f35d] transition hover:bg-white/[0.08] active:scale-[0.97]"
            >
              <Bot className="h-[18px] w-[18px]" />
            </button>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold tracking-[-0.04em] text-white">Autopilot</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#83949b]">Studio / Control plane</p>
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2 pt-3">
          {!isCollapsed && <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.17em] text-[#6e8088]">Workspace</p>}
          <SidebarMenu className="gap-1">
            {navigation.map(item => {
              const active = location === item.path;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={item.label}
                    onClick={() => setLocation(item.path)}
                    className={`h-10 rounded-xl px-3 text-[13px] font-medium transition ${active ? "bg-[#b7f05a] text-[#11190a] hover:bg-[#c4f774]" : "text-[#9daeb3] hover:bg-white/[0.055] hover:text-white"}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>

          {!isCollapsed && (
            <div className="mx-2 mt-8 rounded-2xl border border-[#b7f05a]/15 bg-[#b7f05a]/[0.055] p-3.5">
              <div className="mb-2 flex items-center gap-2 text-[#c8f77b]">
                <Command className="h-3.5 w-3.5" />
                <span className="font-mono text-[10px] uppercase tracking-[0.13em]">Local-first</span>
              </div>
              <p className="text-xs leading-5 text-[#9cae9d]">Your code stays on your machine. Studio stores preferences and decision metadata.</p>
            </div>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-white/[0.07] p-3">
          {loading ? (
            <div className="h-10 animate-pulse rounded-xl bg-white/[0.05]" />
          ) : isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-9 w-9 border border-white/[0.1] bg-[#1a272f]">
                <AvatarFallback className="bg-transparent text-xs font-bold text-[#dbeccf]">{user.name?.slice(0, 1).toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{user.name || "Autopilot user"}</p>
                  <p className="truncate font-mono text-[10px] text-[#7e9197]">SIGNED IN</p>
                </div>
              )}
              {!isCollapsed && (
                <button onClick={logout} aria-label="Sign out" className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-[#7e9197] transition hover:bg-white/[0.06] hover:text-white">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className={`flex ${isCollapsed ? "justify-center" : "items-center gap-2"}`}>
              <CircleUserRound className="h-5 w-5 text-[#83949b]" />
              {!isCollapsed && <Button onClick={() => startLogin()} size="sm" className="h-9 flex-1 rounded-xl bg-white/[0.09] text-xs text-white hover:bg-white/[0.14]">Sign in to connect</Button>}
            </div>
          )}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#0a0f14] text-foreground">
        {isMobile && (
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.08] bg-[#0a0f14]/95 px-3 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="rounded-lg border border-white/[0.1] bg-white/[0.04]" />
              <span className="text-sm font-bold tracking-tight text-white">Autopilot Studio</span>
            </div>
            <ChevronRight className="h-4 w-4 text-[#83949b]" />
          </header>
        )}
        <main className="min-h-screen p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
