/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        metro: {
          blue: '#0078D4',
          blueHover: '#1084D9',
          blueActive: '#006CBE',
          base: '#121212',
          surface: '#161616',
          panel: '#1c1c1c',
          card: '#222222',
          win: '#107C41',
          loss: '#C42B1C',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Consolas"', '"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
