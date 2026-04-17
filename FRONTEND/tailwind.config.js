/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: 'hsl(210, 40%, 98%)',
        foreground: 'hsl(222, 60%, 8%)',
        card: 'hsl(0, 0%, 100%)',
        'card-foreground': 'hsl(222, 60%, 8%)',
        'card-border': 'hsl(214, 28%, 84%)',
        primary: 'hsl(24, 95%, 53%)',
        'primary-foreground': 'hsl(0, 0%, 100%)',
        secondary: 'hsl(214, 24%, 88%)',
        muted: 'hsl(214, 24%, 88%)',
        'muted-foreground': 'hsl(215, 22%, 33%)',
        accent: 'hsl(214, 24%, 86%)',
        destructive: 'hsl(0, 84%, 60%)',
        success: 'hsl(142, 71%, 45%)',
        warning: 'hsl(43, 96%, 56%)',
        border: 'hsl(214, 24%, 82%)',
        ring: 'hsl(24, 95%, 45%)',
        sidebar: 'hsl(222, 47%, 11%)',
        'sidebar-foreground': 'hsl(210, 40%, 98%)',
        'sidebar-primary': 'hsl(24, 95%, 53%)',
      },
      fontFamily: {
        sans: ['Inter', 'System'],
        display: ['Outfit', 'System'],
      },
      borderRadius: {
        DEFAULT: '0.75rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
    },
  },
  plugins: [],
};
