import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Trophy, ArrowRight, LogOut, LogIn, Github, Settings } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { handleLogout } from "@/utils/auth";
import type { Year } from "@shared/schema";

export default function SelectYear() {
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Fetch available years from database
  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ["/api/years"],
    queryFn: async () => {
      const response = await fetch("/api/years");
      return response.json();
    },
  });

  const handleYearSelection = async () => {
    if (!selectedYear) return;
    
    const year = parseInt(selectedYear);
    
    // Find the year record in our available years
    const yearRecord = years?.find((y: Year) => y.year === year);
    if (yearRecord) {
      // Navigate to the year page using the year number, not the UUID
      setLocation(`/year/${year}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header with user info */}
      <header className="bg-card border-b border-border p-4">
        <div className="max-w-7xl mx-auto flex items-center">
          <div className="flex items-center gap-2">
            <Trophy className="text-primary" size={24} />
            <span className="text-xl font-bold text-primary">KAK Cup</span>
          </div>
          
          <div className="flex items-center gap-4 ml-auto">
            {isAuthenticated ? (
              <>
                <span className="text-muted-foreground">
                  Welcome, {user?.firstName || user?.email}
                  {user?.role === 'admin' && (
                    <span className="ml-2 px-2 py-1 text-xs bg-primary/20 text-primary rounded-full">
                      Admin
                    </span>
                  )}
                </span>
                {user?.role === 'admin' && (
                  <Button
                    onClick={() => setLocation('/settings')}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Settings size={16} />
                  </Button>
                )}
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <LogOut size={16} />
                  Logout
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setLocation('/login')}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <LogIn size={16} />
                Login
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-lg w-full text-center">
          
          {/* Trophy Icon */}
          <div className="mb-8 flex justify-center">
            <div className="p-6 bg-primary/10 rounded-full shadow-lg">
              <Trophy size={64} className="text-primary" />
            </div>
          </div>

          {/* Brand Title */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-primary tracking-tight mb-4" data-testid="title-kak-cup">
            KAK Cup
          </h1>
          
          {/* Subtitle */}
          <p className="text-xl sm:text-2xl text-muted-foreground mb-4 font-medium">
            Select Tournament Year
          </p>

          {/* Poem */}
          <div className="mb-12">
            <div className="text-lg text-muted-foreground leading-relaxed space-y-1 italic">
              <div>We get together but once a year,</div>
              <div>To fish, to golf, to chug some beer,</div>
              <div>So raise your glasses for a cheers,</div>
              <div>We'll be KAKs for years and years</div>
            </div>
          </div>

          {/* Year Selection */}
          <div className="mb-8">
            <select 
              id="year-select"
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              data-testid="select-year"
            >
              <option value="">Choose a tournament year...</option>
              {yearsLoading ? (
                <option disabled>Loading years...</option>
              ) : (
                (() => {
                  const currentYear = new Date().getFullYear();
                  const sortedYears = [...(years || [])].sort((a: Year, b: Year) => {
                    // Current year first
                    if (a.year === currentYear && b.year !== currentYear) return -1;
                    if (b.year === currentYear && a.year !== currentYear) return 1;
                    // Past years (Done) come before future years (Upcoming)
                    const aIsPast = a.year < currentYear;
                    const bIsPast = b.year < currentYear;
                    if (aIsPast && !bIsPast) return -1;
                    if (bIsPast && !aIsPast) return 1;
                    // Within same category, sort by year descending
                    return b.year - a.year;
                  });

                  return sortedYears.map((yearData: Year) => {
                    let statusText = "";
                    if (yearData.year < currentYear) {
                      statusText = " (Done)";
                    } else if (yearData.year > currentYear) {
                      statusText = " (Upcoming)";
                    }

                    return (
                      <option key={yearData.year} value={yearData.year} data-testid={`option-year-${yearData.year}`}>
                        {yearData.year} - {yearData.name}{statusText}
                      </option>
                    );
                  });
                })()
              )}
            </select>
          </div>

          {/* Continue Button */}
          <button
            onClick={handleYearSelection}
            disabled={!selectedYear}
            className="btn-primary text-xl px-8 py-4 rounded-xl shadow-lg hover:shadow-xl disabled:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground transform hover:scale-105 disabled:hover:scale-100 transition-all duration-200 flex items-center gap-2 mx-auto"
            data-testid="button-continue"
          >
            Enter Tournament
            <ArrowRight size={24} />
          </button>

          {/* Features */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className="p-4">
              <div className="text-2xl mb-2">🎣</div>
              <h3 className="font-semibold text-foreground">Fish Competition</h3>
              <p className="text-sm text-muted-foreground">Top-3 fish only</p>
            </div>
            <div className="p-4">
              <div className="text-2xl mb-2">🍺</div>
              <h3 className="font-semibold text-foreground">Beer Chug Relay</h3>
              <p className="text-sm text-muted-foreground">4-man relay</p>
            </div>
            <div className="p-4">
              <div className="text-2xl mb-2">⛳</div>
              <h3 className="font-semibold text-foreground">Golf Tournament</h3>
              <p className="text-sm text-muted-foreground">4-man scramble</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-muted-foreground text-sm space-y-1">
        <div className="flex items-center justify-center gap-2">
          <a
            href="https://github.com/atulify/kakcup/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Github size={16} />
            <span>atulify/kakcup</span>
          </a>
        </div>
        <p className="text-xs text-muted-foreground/60">
          {__COMMIT_HASH__}
        </p>
      </footer>
    </div>
  );
}