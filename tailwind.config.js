/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        core: {
          bg: "var(--ga-bg)",
          bg2: "var(--ga-bg-2)",
          surface: "var(--ga-surface)",
          surfaceSolid: "var(--ga-surface-solid)",
          border: "var(--ga-border)",
          text: "var(--ga-text)",
          muted: "var(--ga-muted)",
          primary: "var(--ga-primary)",
          primaryStrong: "var(--ga-primary-strong)",
          primaryFg: "var(--ga-primary-fg)",
          accent: "var(--ga-accent)",
          danger: "var(--ga-danger)",
          ok: "var(--ga-success)",
          success: "var(--ga-success)",
          warn: "var(--ga-warn)",
        },
        role: {
          super: "var(--ga-role-super)",
          reseller: "var(--ga-role-reseller)",
          user: "var(--ga-role-user)",
        },
      },
      fontFamily: {
        sans: ["Vazirmatn", "IRANSans", "Segoe UI", "Tahoma", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "var(--ga-glow)",
        "glow-lg": "var(--ga-shadow-lg)",
      },
    },
  },
  plugins: [],
};
