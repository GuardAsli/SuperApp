/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        core: {
          bg: "var(--ga-bg)",
          surface: "var(--ga-surface)",
          border: "var(--ga-border)",
          text: "var(--ga-text)",
          muted: "var(--ga-muted)",
          primary: "var(--ga-primary)",
          primaryFg: "var(--ga-primary-fg)",
          accent: "var(--ga-accent)",
          danger: "var(--ga-danger)",
          ok: "var(--ga-ok)",
          warn: "var(--ga-warn)",
        },
      },
    },
  },
  plugins: [],
};
