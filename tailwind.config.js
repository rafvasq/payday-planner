/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f5ff',
          100: '#e0ebff',
          500: '#4078f2',
          600: '#2e63d8',
          700: '#1d4ed8',
        },
        ink: {
          900: '#1e2025',
          800: '#2e3138',
          700: '#383a42',
          500: '#6c707e',
          400: '#8b90a0',
          200: '#e5e8f0',
          100: '#f5f7fb',
        }
      }
    },
  },
  plugins: [],
}
