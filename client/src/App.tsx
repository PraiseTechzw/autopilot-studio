import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Home from "@/pages/Home";
import Integrations from "@/pages/Integrations";
import NotFound from "@/pages/NotFound";
import TeamApprovals from "@/pages/TeamApprovals";
import { Route, Switch } from "wouter";

function StudioRoute() {
  return <DashboardLayout><Home /></DashboardLayout>;
}

function IntegrationsRoute() {
  return <DashboardLayout><Integrations /></DashboardLayout>;
}

function TeamApprovalsRoute() {
  return <DashboardLayout><TeamApprovals /></DashboardLayout>;
}

function Router() {
  return <Switch>
    <Route path="/" component={StudioRoute} />
    <Route path="/repositories" component={StudioRoute} />
    <Route path="/policies" component={StudioRoute} />
    <Route path="/extensions" component={StudioRoute} />
    <Route path="/activity" component={StudioRoute} />
    <Route path="/alerts" component={StudioRoute} />
    <Route path="/integrations" component={IntegrationsRoute} />
    <Route path="/team" component={TeamApprovalsRoute} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Router /><Toaster theme="dark" richColors /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
