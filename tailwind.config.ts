import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "0px",
        md: "0px",
        sm: "0px",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },

        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        // B3 named colors for use in utilities
        orange: "var(--orange)",
        ice: "var(--ice)",
      },
      fontFamily: {
        sans: ["Rajdhani", "var(--font-sans)", "sans-serif"],
        display: ["Orbitron", "var(--font-display)", "sans-serif"],
        mono: ["Share Tech Mono", "var(--font-mono)", "monospace"],
        serif: ["var(--font-serif)"],
      },
    },
  },
  plugins: [],
} satisfies Config;
