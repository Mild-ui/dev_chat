// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        gray: {
          950: '#0a0a0f',
        }
      },
      animation: {
        'bounce-slow': 'bounce 1.5s infinite',
      }
    }
  },
  plugins: []
};
