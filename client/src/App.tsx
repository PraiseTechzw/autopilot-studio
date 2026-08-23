import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";

function StudioRoute() {
  return (
    <DashboardLayout>
      <Home />
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={StudioRoute} />
      <Route path="/repositories" component={StudioRoute} />
      <Route path="/policies" component={StudioRoute} />
      <Route path="/extensions" component={StudioRoute} />
      <Route path="/activity" component={StudioRoute} />
      <Route path="/alerts" component={StudioRoute} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Router />
          <Toaster theme="dark" richColors />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
