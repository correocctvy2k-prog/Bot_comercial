/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#0a0a0f', // Dark accent background
        },
        dark: {
          bg: '#0a0a0f',
          card: '#11111a',
          border: '#1f1f2e',
          text: '#94a3b8',
          glow: '#7c3aed'
        }
      },
      boxShadow: {
        'glow-purple': '0 0 15px rgba(124, 58, 237, 0.15)',
        'glow-indigo': '0 0 15px rgba(99, 102, 241, 0.15)',
      }
    },
  },
  plugins: [],
}
