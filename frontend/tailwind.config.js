/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0f1729",
          800: "#141f38",
          700: "#1a2847",
          600: "#1e3056",
        },
        teal: {
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
        },
      },
    },
  },
  plugins: [],
}

