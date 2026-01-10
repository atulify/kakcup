import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogIn, Trophy, LogOut } from "lucide-react";

export default function Home() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-slate-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header with login/logout */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/20 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Trophy className="text-blue-600" size={24} />
            <span className="text-xl font-bold text-blue-600">KAK Cup</span>
          </div>
          
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                <span className="text-slate-600">
                  Welcome, {user?.firstName || user?.email}
                  {user?.role === 'admin' && (
                    <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                      Admin
                    </span>
                  )}
                </span>
                <Button
                  onClick={() => window.location.href = '/api/logout'}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <LogOut size={16} />
                  Logout
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => window.location.href = '/api/login'}
                className="flex items-center gap-2"
                size="sm"
              >
                <LogIn size={16} />
                Login
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-blue-600 mb-8">Welcome to KAK Cup</h1>
          
          {isAuthenticated ? (
            <Link
              href="/select-year"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Enter Tournament
            </Link>
          ) : (
            <div className="space-y-4">
              <p className="text-lg text-slate-600 mb-6">
                Please login to access the tournament
              </p>
              <Button
                onClick={() => window.location.href = '/api/login'}
                className="flex items-center gap-2"
                size="lg"
              >
                <LogIn size={20} />
                Login to Continue
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
