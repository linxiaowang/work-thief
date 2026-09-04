/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{vue,ts,js,html}'],
  theme: {
    extend: {
      colors: {
        theme: {
          'bg-default': 'var(--theme-bg)',
          'fg-default': 'var(--theme-fg)',
          'bg-soft': 'var(--theme-bg-soft)',
          'fg-soft': 'var(--theme-fg-soft)',
          accent: 'var(--theme-accent)'
        }
      },
      fontFamily: {
        reader: 'var(--reader-font)',
        system: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
      }
    }
  },
  plugins: []
}
