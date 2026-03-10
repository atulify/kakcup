import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy, LogIn, UserPlus } from "@/components/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({ username: "", email: "", password: "", firstName: "", lastName: "" });

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

  const registerMutation = useMutation({
    mutationFn: async (data: typeof registerData) => {
      return await apiRequest("/api/auth/register", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Success", description: "Account created successfully!" });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({ title: "Registration Failed", description: error.message || "Failed to create account", variant: "destructive" });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.username && loginData.password) loginMutation.mutate(loginData);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (registerData.username && registerData.password) registerMutation.mutate(registerData);
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

          {/* Tab toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", marginBottom: "1px", background: "var(--border-hi)" }}>
            {(["login", "register"] as const).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "0.75rem",
                    fontFamily: "var(--font-display)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    background: isActive ? "rgba(255,90,0,0.1)" : "var(--card)",
                    color: isActive ? "var(--orange)" : "var(--text-dim)",
                    borderBottom: isActive ? "2px solid var(--orange)" : "2px solid transparent",
                    cursor: "pointer",
                    outline: "none",
                    transition: "all 0.15s",
                  }}
                >
                  {tab === "login" ? "⬡ Login" : "⬡ Register"}
                </button>
              );
            })}
          </div>

          {/* Form card */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border-hi)", borderTop: "none", clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)", padding: "1.75rem 1.5rem" }}>

            {activeTab === "login" && (
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
            )}

            {activeTab === "register" && (
              <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <label htmlFor="register-username" style={labelStyle}>Username</label>
                  <input id="register-username" type="text" value={registerData.username} onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))} required className="b3-focus" style={inputStyle} data-testid="input-register-username" />
                </div>
                <div>
                  <label htmlFor="register-email" style={labelStyle}>Email (optional)</label>
                  <input id="register-email" type="email" value={registerData.email} onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))} className="b3-focus" style={inputStyle} data-testid="input-register-email" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div>
                    <label htmlFor="register-firstName" style={labelStyle}>First Name</label>
                    <input id="register-firstName" type="text" value={registerData.firstName} onChange={(e) => setRegisterData(prev => ({ ...prev, firstName: e.target.value }))} className="b3-focus" style={inputStyle} data-testid="input-register-firstName" />
                  </div>
                  <div>
                    <label htmlFor="register-lastName" style={labelStyle}>Last Name</label>
                    <input id="register-lastName" type="text" value={registerData.lastName} onChange={(e) => setRegisterData(prev => ({ ...prev, lastName: e.target.value }))} className="b3-focus" style={inputStyle} data-testid="input-register-lastName" />
                  </div>
                </div>
                <div>
                  <label htmlFor="register-password" style={labelStyle}>Password</label>
                  <input id="register-password" type="password" value={registerData.password} onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))} required className="b3-focus" style={inputStyle} data-testid="input-register-password" />
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: "0.25rem" }}
                  disabled={registerMutation.isPending}
                  data-testid="button-register"
                >
                  <UserPlus size={14} />
                  {registerMutation.isPending ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
