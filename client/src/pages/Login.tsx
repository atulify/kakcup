import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy, LogIn } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [loginData, setLoginData] = useState({ username: "", password: "" });

  const loginMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      return await apiRequest("/api/auth/login", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Success", description: "Logged in successfully!" });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({ title: "Login Failed", description: error.message || "Invalid credentials", variant: "destructive" });
    },
  });


  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.username && loginData.password) loginMutation.mutate(loginData);
  };


  const inputStyle: React.CSSProperties = {
    display: "flex",
    width: "100%",
    padding: "0.625rem 0.875rem",
    background: "var(--input)",
    color: "var(--foreground)",
    border: "1px solid var(--border-hi)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    clipPath: "var(--clip-sm)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-display)",
    fontSize: "0.6rem",
    letterSpacing: "0.12em",
    color: "var(--ice)",
    textTransform: "uppercase",
    marginBottom: "0.375rem",
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border-hi)" }} className="py-3 px-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Trophy style={{ color: "var(--orange)" }} size={18} />
            <span style={{ fontFamily: "var(--font-display)", color: "var(--orange)", fontSize: "0.9rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              KAK Cup
            </span>
          </div>
          <button
            onClick={() => setLocation("/")}
            className="btn-ghost text-xs"
          >
            ← Back to Home
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div style={{ width: "100%", maxWidth: "400px" }}>


          {/* Form card */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border-hi)", clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)", padding: "1.75rem 1.5rem" }}>

              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label htmlFor="login-username" style={labelStyle}>Username</label>
                  <input
                    id="login-username"
                    type="text"
                    value={loginData.username}
                    onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                    required
                    className="b3-focus"
                    style={inputStyle}
                    data-testid="input-login-username"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" style={labelStyle}>Password</label>
                  <input
                    id="login-password"
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    className="b3-focus"
                    style={inputStyle}
                    data-testid="input-login-password"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: "0.25rem" }}
                  disabled={loginMutation.isPending}
                  data-testid="button-login"
                >
                  <LogIn size={14} />
                  {loginMutation.isPending ? "AUTHENTICATING..." : "SIGN IN"}
                </button>
              </form>

          </div>
        </div>
      </main>
    </div>
  );
}
