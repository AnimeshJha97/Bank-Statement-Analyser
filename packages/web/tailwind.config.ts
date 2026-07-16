import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        card2: "var(--card2)",
        ink: "var(--ink)",
        ink2: "var(--ink2)",
        ink3: "var(--ink3)",
        line: "var(--line)",
        accent: "var(--accent)",
        "accent-t": "var(--accent-t)",
        good: "var(--good)",
        warn: "var(--warn)",
        "warn-bg": "var(--warn-bg)",
      },
      fontFamily: { sans: ["var(--sans)"] },
      boxShadow: { card: "var(--shadow)" },
      borderRadius: { card: "16px" },
      keyframes: {
        fadeUp: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        pulseSoft: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: {
        fadeUp: "fadeUp .25s ease",
        pulseSoft: "pulseSoft 1.1s ease infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
