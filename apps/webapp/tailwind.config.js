/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-mono)', 'Courier New', 'monospace'],
        mono: ['var(--font-mono)', 'Courier New', 'monospace'],
        brand: ['var(--font-brand)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        light: {
          "primary": "#f59e0b",           // Amber - warm, archive-like
          "secondary": "#6366f1",         // Indigo - deep, scholarly
          "accent": "#14b8a6",            // Teal - technical accent
          "neutral": "#3d4451",           // Dark slate
          "base-100": "#faf8f5",          // Warm off-white, like aged paper
          "base-200": "#f1ede7",          // Slightly darker warm
          "base-300": "#e3dcd1",          // Even darker warm tone
          "info": "#3b82f6",
          "success": "#10b981",
          "warning": "#f59e0b",
          "error": "#ef4444",
        },
        dark: {
          "primary": "#fbbf24",           // Brighter amber for dark
          "secondary": "#818cf8",         // Lighter indigo
          "accent": "#5eead4",            // Bright teal
          "neutral": "#1f2937",
          "base-100": "#111827",          // Very dark blue-gray
          "base-200": "#1f2937",
          "base-300": "#374151",
          "info": "#60a5fa",
          "success": "#34d399",
          "warning": "#fbbf24",
          "error": "#f87171",
        },
      },
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    prefix: "",
    logs: false,
    themeRoot: ":root",
  },
};
