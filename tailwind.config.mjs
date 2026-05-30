/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,ts,md,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Zodiak', 'Georgia', 'serif'],
        body: ['Satoshi', 'Inter', 'sans-serif'],
      },
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        'surface-offset': 'var(--color-surface-offset)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          highlight: 'var(--color-primary-highlight)',
        },
      },
      maxWidth: {
        content: '1140px',
      },
    },
  },
  plugins: [],
};
