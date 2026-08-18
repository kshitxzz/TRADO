/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary':   '#0A0A0F',
        'bg-sidebar':   '#0D0C12',
        'bg-card':      '#131217',
        'bg-card-hover':'#1A1820',
        'bg-landing':   '#110B22',
        'accent-purple':       '#8B5CF6',
        'accent-purple-light': '#A78BFA',
        'accent-purple-deep':  '#7C3AED',
        'accent-teal':  '#2DD4BF',
        'accent-cyan':  '#22D3EE',
        'positive':     '#22C55E',
        'positive-bright':'#34D399',
        'negative':     '#F43F5E',
        'warning':      '#F59E0B',
        'text-secondary':'#9CA3AF',
        'text-muted':   '#6B7280',
      },
      fontFamily: {
        sans: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'marquee': 'marquee 30s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 50%, #4F46E5 100%)',
        'gradient-teal':    'linear-gradient(135deg, #22D3EE 0%, #06B6D4 100%)',
        'gradient-text':    'linear-gradient(135deg, #C4B5FD 0%, #A78BFA 50%, #818CF8 100%)',
      },
    },
  },
  plugins: [],
}