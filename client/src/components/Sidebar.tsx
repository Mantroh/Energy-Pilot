import { Link, useLocation } from "wouter";
import { LayoutDashboard, Server, BarChart3, AlertTriangle, Settings, LogOut, User, Zap, Database, Menu, Users, Network, Radio, Calculator, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/", roles: ["admin", "operator", "viewer"] },
  { name: "Devices", icon: Server, href: "/devices", roles: ["admin"] }, // Only admin
  { name: "Meters", icon: Zap, href: "/meters", roles: ["admin", "operator"] }, // Admin and operator
  { name: "Meter Discovery", icon: Database, href: "/meter-discovery", roles: ["admin"] }, // Only admin
  { name: "BACnet Discovery", icon: Network, href: "/bacnet-discovery", roles: ["admin"] }, // Only admin
  { name: "Modbus Scanner", icon: Radio, href: "/modbus-scanner", roles: ["admin"] }, // Only admin
  { name: "Energy Meters", icon: Zap, href: "/modbus-energy-discovery", roles: ["admin"] }, // Only admin
  { name: "Analytics", icon: BarChart3, href: "/analytics", roles: ["admin", "operator", "viewer"] },
  { name: "Custom Analytics", icon: Calculator, href: "/custom-analytics", roles: ["admin", "operator", "viewer"] },
  { name: "Predictive Analysis", icon: TrendingUp, href: "/predictive-analysis", roles: ["admin", "operator", "viewer"] },
  { name: "Alarms", icon: AlertTriangle, href: "/alarms", roles: ["admin", "operator", "viewer"] },
  { name: "Thresholds", icon: Settings, href: "/alarm-thresholds", roles: ["admin", "operator", "viewer"] },
  { name: "BMS Management", icon: Database, href: "/bms-management", roles: ["admin"] }, // Only admin
  { name: "User Management", icon: Users, href: "/user-management", roles: ["admin"] }, // Only admin
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  const SidebarContent = () => (
    <>
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 border-b border-border/50">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="font-bold text-lg tracking-wider text-foreground">EnCharge</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1">
        {navItems.filter(item => item.roles.includes(user?.role || "operator")).map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                onClick={() => isMobile && setIsMobileOpen(false)}
                className={cn(
                  "flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-primary/10 text-primary shadow-[inset_4px_0_0_0_theme(colors.primary.DEFAULT)]"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "mr-3 h-5 w-5 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User / Footer */}
      <div className="p-4 border-t border-border/50">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center border border-border">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="User" className="w-full h-full rounded-full" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">
              {user?.firstName || user?.username || "Operator"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email || (user?.role === "admin" ? "System Admin" : "System Operator")}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center px-4 py-2 rounded-md bg-secondary text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors border border-border hover:border-destructive/20"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-card border-b border-border/50 flex items-center justify-between px-4 z-50 lg:hidden">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileOpen(true)}
              className="mr-3"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center mr-2 shadow-lg shadow-primary/20">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm tracking-wider text-foreground">EnCharge</span>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border/50 flex flex-col z-40 hidden lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {isMobile && (
        <>
          <div 
            className={cn(
              "fixed inset-0 bg-background/80 backdrop-blur-sm z-50 lg:hidden transition-opacity",
              isMobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={() => setIsMobileOpen(false)}
          />
          <aside 
            className={cn(
              "fixed left-0 top-0 h-screen w-64 bg-card border-r border-border/50 flex flex-col z-50 lg:hidden transition-transform",
              isMobileOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  );
}
