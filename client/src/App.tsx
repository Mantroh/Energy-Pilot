import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Devices from "@/pages/Devices";
import { Meters } from "@/pages/Meters";
import Alarms from "@/pages/Alarms";
import AlarmThresholds from "@/pages/AlarmThresholds";
import Analytics from "@/pages/Analytics";
import CustomAnalytics from "@/pages/CustomAnalytics";
import PredictiveAnalysis from "@/pages/PredictiveAnalysis";
import BACnetDiscovery from "@/pages/BACnetDiscovery";
import ModbusScanner from "@/pages/ModbusScanner";
import ModbusEnergyDiscovery from "@/pages/ModbusEnergyDiscovery";
import MeterDiscovery from "@/pages/MeterDiscovery";
import { BMSManagement } from "@/pages/BMSManagement";
import { UserManagement } from "@/pages/UserManagement";
import { Sidebar } from "@/components/Sidebar";
import { LoginPage } from "@/components/LoginPage";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component, allowedRoles = ["admin", "operator", "viewer"], ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={() => window.location.reload()} />;
  }

  // Check if user has required role
  if (!allowedRoles.includes(user.role || "operator")) {
    return (
      <div className="flex min-h-screen bg-background text-foreground font-sans">
        <Sidebar />
        <main className="flex-1 lg:ml-64 overflow-y-auto min-h-screen">
          <div className="p-4 sm:p-6 lg:p-8 pt-20 lg:pt-8">
            <div className="flex flex-col items-center justify-center py-16">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
                <p className="text-muted-foreground mb-4">
                  You don't have permission to access this page.
                </p>
                <p className="text-sm text-muted-foreground">
                  Required role: {allowedRoles.join(" or ")} | Your role: {user.role}
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      <Sidebar />
      <main className="flex-1 lg:ml-64 overflow-y-auto min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 pt-20 lg:pt-8">
          <Component />
        </div>
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/devices">
        <ProtectedRoute component={Devices} allowedRoles={["admin"]} />
      </Route>
      <Route path="/meters">
        <ProtectedRoute component={Meters} allowedRoles={["admin", "operator"]} />
      </Route>
      <Route path="/meter-discovery">
        <ProtectedRoute component={MeterDiscovery} allowedRoles={["admin"]} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={Analytics} />
      </Route>
      <Route path="/custom-analytics">
        <ProtectedRoute component={CustomAnalytics} />
      </Route>
      <Route path="/predictive-analysis">
        <ProtectedRoute component={PredictiveAnalysis} />
      </Route>
      <Route path="/bacnet-discovery">
        <ProtectedRoute component={BACnetDiscovery} allowedRoles={["admin"]} />
      </Route>
      <Route path="/modbus-scanner">
        <ProtectedRoute component={ModbusScanner} allowedRoles={["admin"]} />
      </Route>
      <Route path="/modbus-energy-discovery">
        <ProtectedRoute component={ModbusEnergyDiscovery} allowedRoles={["admin"]} />
      </Route>
      <Route path="/alarms">
        <ProtectedRoute component={Alarms} />
      </Route>
      <Route path="/alarm-thresholds">
        <ProtectedRoute component={AlarmThresholds} />
      </Route>
      <Route path="/bms-management">
        <ProtectedRoute component={BMSManagement} allowedRoles={["admin"]} />
      </Route>
      <Route path="/user-management">
        <ProtectedRoute component={UserManagement} allowedRoles={["admin"]} />
      </Route>
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
