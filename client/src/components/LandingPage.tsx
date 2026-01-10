import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Smartphone } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Year } from "@shared/schema";

export default function LandingPage() {
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Fetch available years from database
  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ["/api/years"],
    queryFn: async () => {
      const response = await fetch("/api/years");
      return response.json();
    },
  });

  const createYearMutation = useMutation({
    mutationFn: (year: number) => apiRequest(`/api/years`, "POST", {
      year,
      name: `KAK Cup ${year}`,
      status: "upcoming"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
    }
  });

  const handleYearSelection = async () => {
    if (!selectedYear) return;
    
    const year = parseInt(selectedYear);
    
    try {
      // Try to create the year first (in case it doesn't exist)
      await createYearMutation.mutateAsync(year);
    } catch (error) {
      // Year might already exist, that's fine
      console.log("Year might already exist:", error);
    }
    
    // Navigate to the year page
    setLocation(`/year/${selectedYear}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        {/* Empty header for future navigation */}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          
          {/* Brand Title */}
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-blue-600 tracking-tight" data-testid="title-kak-cup">
              KAK Cup
            </h1>
            <p className="mt-4 text-lg text-slate-600" data-testid="text-subtitle">
              Select a tournament year to get started
            </p>
          </div>

          {/* Year Selection Form */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
              
            {/* Year Dropdown */}
            <div className="space-y-2">
              <label htmlFor="year-select" className="block text-sm font-medium text-slate-700">
                Tournament Year
              </label>
              <select 
                id="year-select"
                value={selectedYear} 
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-4 py-3 text-base bg-white border border-slate-300 rounded-lg shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                data-testid="select-year"
              >
                <option value="">Choose a year...</option>
                {yearsLoading ? (
                  <option disabled>Loading years...</option>
                ) : (
                  years?.map((yearData: Year) => (
                    <option key={yearData.year} value={yearData.year} data-testid={`option-year-${yearData.year}`}>
                      {yearData.year}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Action Button */}
            <div className="pt-4">
              <button
                onClick={handleYearSelection}
                disabled={!selectedYear || createYearMutation.isPending}
                className="group w-full flex justify-center items-center px-6 py-4 text-base font-semibold text-white bg-green-600 rounded-lg shadow-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transform transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                data-testid="button-go"
              >
                {createYearMutation.isPending ? (
                  <>
                    <svg className="w-5 h-5 animate-spin mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <span>Go</span>
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>
            </div>

          </div>

          {/* Feature Hints */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <div className="grid grid-cols-1 gap-4 text-center">
              <div className="flex items-center justify-center space-x-2 text-sm text-slate-500" data-testid="hint-pwa">
                <Smartphone className="w-4 h-4" />
                <span>Install as PWA for offline access</span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-slate-500" data-testid="text-footer">
            © 2024 KAK Cup. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
}