import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Users, Fish, Beer, Flag, Trophy, Home, LogOut, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import TeamsTab from "@/components/TeamsTab";
import FishTab from "@/components/FishTab";
import ChugTab from "@/components/ChugTab";
import GolfTab from "@/components/GolfTab";
import StandingsTab from "@/components/StandingsTab";
import { apiRequest } from "@/lib/queryClient";
import { handleLogout } from "@/utils/auth";
import type { Year } from "@shared/schema";

type Tab = {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
};

const tabs: Tab[] = [
  { id: "teams", name: "Teams", icon: Users },
  { id: "fish", name: "Fish", icon: Fish },
  { id: "chug", name: "Chug", icon: Beer },
  { id: "golf", name: "Golf", icon: Flag },
  { id: "standings", name: "Standings", icon: Trophy },
];

export default function YearPage() {
  const [, params] = useRoute("/year/:year");
  const [, setLocation] = useLocation();
  const year = params?.year;
  const [activeTab, setActiveTab] = useState("teams");
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: yearData, isLoading } = useQuery<Year>({
    queryKey: ["/api/years", year],
    queryFn: async () => {
      return await apiRequest(`/api/years/${year}`);
    },
    enabled: !!year,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading KAK Cup {year}...</p>
        </div>
      </div>
    );
  }

  if (!yearData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-4">Year Not Found</h1>
          <p className="text-slate-600">KAK Cup {year} is not available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border py-3">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold text-primary" data-testid="title-year">
              KAK Cup {yearData.year}
            </h1>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <Link
                href="/"
                className="btn-ghost flex items-center gap-1 px-2 py-1"
                data-testid="link-home"
              >
                <Home size={18} />
                <span className="text-sm font-medium hidden sm:inline">Home</span>
              </Link>
              
              {isAuthenticated ? (
                <>
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    <span className="hidden sm:inline text-foreground">{user?.firstName || user?.email}</span>
                    <span className="sm:hidden text-foreground">{user?.username}</span>
                    {user?.role === 'admin' && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
                        Admin
                      </span>
                    )}
                  </span>
                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1 px-2 py-1 text-xs sm:text-sm"
                  >
                    <LogOut size={14} />
                    <span className="hidden sm:inline">Logout</span>
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setLocation('/login')}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 px-2 py-1 text-xs sm:text-sm"
                >
                  <LogIn size={14} />
                  <span className="hidden sm:inline">Login</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-16">
        {activeTab === "teams" && <TeamsTab yearId={yearData.id} />}
        {activeTab === "fish" && <FishTab yearId={yearData.id} yearData={yearData} />}
        {activeTab === "chug" && <ChugTab yearId={yearData.id} />}
        {activeTab === "golf" && <GolfTab yearId={yearData.id} />}
        {activeTab === "standings" && <StandingsTab yearId={yearData.id} />}
      </main>

      {/* Bottom Tabs - Fixed to bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-pb z-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-5 gap-0">
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center py-2 px-1 transition-colors duration-200 border-r border-border last:border-r-0 ${
                    activeTab === tab.id 
                      ? "text-primary bg-primary/10 border-t-2 border-t-primary" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <IconComponent className="w-5 h-5 mb-0.5" />
                  <span className="text-xs font-medium">{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}