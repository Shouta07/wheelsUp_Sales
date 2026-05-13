import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mute: "#64748b",
        line: "#e2e8f0",
        accent: "#2563eb",
        good: "#15803d",
        warn: "#b45309",
        bad: "#b91c1c",
      },
    },
  },
  plugins: [],
};
export default config;
