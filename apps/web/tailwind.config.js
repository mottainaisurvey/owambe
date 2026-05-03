/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Owambe Brand — Purple primary, Gold accent
        primary: {
          DEFAULT: '#6C2BD9',   /* Owambe purple */
          50:  '#F3EEFF',
          100: '#E0CCFF',
          200: '#C5A3FF',
          300: '#A87AFF',
          400: '#8B51F5',
          500: '#6C2BD9',
          600: '#5720B5',
          700: '#431890',
          800: '#30106C',
          900: '#1E0848',
        },
        accent: {
          DEFAULT: '#C9A227',   /* Owambe gold */
          50:  '#FDF8E7',
          100: '#F9EDBB',
          200: '#F3DC8A',
          300: '#EDCB59',
          400: '#DEBA38',
          500: '#C9A227',
          600: '#A8861F',
          700: '#876A17',
          800: '#664F0F',
          900: '#453407',
        },
        // Semantic
        dark:    '#1C1528',
        mid:     '#3D3452',
        muted:   '#8B82A0',
        surface: '#FFFFFF',
        border:  '#E5E0F0',
        danger:  '#DC2626',
        success: '#059669',
        warning: '#D97706',
      },
      boxShadow: {
        card:   '0 2px 12px rgba(26,22,18,0.06), 0 1px 3px rgba(26,22,18,0.04)',
        'card-hover': '0 4px 20px rgba(26,22,18,0.10), 0 2px 6px rgba(26,22,18,0.06)',
        modal:  '0 20px 60px rgba(26,22,18,0.15)',
      },
      borderRadius: {
        xl:  '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-up': 'fadeUp 0.22s ease both',
        'fade-in': 'fadeIn 0.18s ease both',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
    },
  },
  plugins: [],
};
