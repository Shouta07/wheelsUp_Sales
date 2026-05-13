import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f8ff",
          100: "#e6eeff",
          500: "#3b6dff",
          600: "#2a55e6",
          700: "#1f42c4",
        },
      },
    },
  },
  plugins: [],
};

export default config;
