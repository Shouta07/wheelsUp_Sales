/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe",
          300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6",
          600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a",
        },
        duo: {
          green:  "#58CC02",
          "green-dark": "#46a302",
          yellow: "#FFC800",
          blue:   "#1CB0F6",
          "blue-dark": "#1899D6",
          red:    "#FF4B4B",
          purple: "#CE82FF",
          orange: "#FF9600",
          bg:     "#131F24",
          card:   "#1A2C32",
          snow:   "#F7F7F7",
        },
      },
      fontFamily: {
        display: ['Nunito', 'sans-serif'],
      },
      borderRadius: {
        "duo": "16px",
      },
    },
  },
  plugins: [],
};
