import { useLocation } from "wouter";
import { Trophy, ArrowRight } from "lucide-react";

export default function GenericLandingPage() {
  const [, setLocation] = useLocation();

  const handleGoClick = () => {
    setLocation("/select-year");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-lg w-full text-center">
          
          {/* Trophy Icon */}
          <div className="mb-8 flex justify-center">
            <div className="p-6 bg-yellow-100 rounded-full shadow-lg">
              <Trophy size={64} className="text-yellow-600" />
            </div>
          </div>

          {/* Brand Title */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-blue-600 tracking-tight mb-4" data-testid="title-kak-cup">
            KAK Cup
          </h1>
          
          {/* Subtitle */}
          <p className="text-xl sm:text-2xl text-slate-600 mb-12 font-medium">
            Annual Tournament Platform
          </p>

          {/* Description */}
          <div className="mb-12 space-y-4">
            <p className="text-lg text-slate-700">
              Welcome to the official KAK Cup tournament management system.
            </p>
            <p className="text-base text-slate-600">
              Compete in Fish, Chug, and Golf competitions with your team.
            </p>
          </div>

          {/* Go Button */}
          <button
            onClick={handleGoClick}
            className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 text-white text-xl font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transform hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-300"
            data-testid="button-go"
          >
            Get Started
            <ArrowRight size={24} />
          </button>

          {/* Features */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className="p-4">
              <div className="text-2xl mb-2">🎣</div>
              <h3 className="font-semibold text-slate-800">Fish Competition</h3>
              <p className="text-sm text-slate-600">Track weights and rankings</p>
            </div>
            <div className="p-4">
              <div className="text-2xl mb-2">🍺</div>
              <h3 className="font-semibold text-slate-800">Chug Challenge</h3>
              <p className="text-sm text-slate-600">Time-based competitions</p>
            </div>
            <div className="p-4">
              <div className="text-2xl mb-2">⛳</div>
              <h3 className="font-semibold text-slate-800">Golf Tournament</h3>
              <p className="text-sm text-slate-600">Score tracking and points</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-slate-500 text-sm">
        <p>KAK Cup Tournament Platform</p>
      </footer>
    </div>
  );
}