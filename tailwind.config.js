/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "secondary-fixed-dim": "#d0bcff", "inverse-surface": "#dae2fd", "surface-container": "#171f33", 
        "on-primary-fixed-variant": "#2f2ebe", "surface-tint": "#c0c1ff", "surface-variant": "#2d3449", 
        "on-error-container": "#ffdad6", "background": "#0b1326", "primary-container": "#8083ff", 
        "inverse-on-surface": "#283044", "tertiary-container": "#009eb9", "on-tertiary-fixed": "#001f26", 
        "on-error": "#690005", "tertiary": "#4cd7f6", "surface-container-highest": "#2d3449", 
        "surface-container-high": "#222a3d", "primary-fixed-dim": "#c0c1ff", "on-surface-variant": "#c7c4d7", 
        "surface-dim": "#0b1326", "on-tertiary-container": "#002f38", "outline": "#908fa0", 
        "tertiary-fixed": "#acedff", "on-primary-container": "#0d0096", "outline-variant": "#464554", 
        "surface": "#0b1326", "on-secondary-fixed-variant": "#5516be", "on-primary-fixed": "#07006c", 
        "on-primary": "#1000a9", "on-secondary-fixed": "#23005c", "error-container": "#93000a", 
        "surface-bright": "#31394d", "error": "#ffb4ab", "secondary-fixed": "#e9ddff", 
        "on-tertiary-fixed-variant": "#004e5c", "on-secondary": "#3c0091", "primary": "#c0c1ff", 
        "secondary-container": "#571bc1", "secondary": "#d0bcff", "surface-container-lowest": "#060e20", 
        "primary-fixed": "#e1e0ff", "on-surface": "#dae2fd", "tertiary-fixed-dim": "#4cd7f6", 
        "surface-container-low": "#131b2e", "on-secondary-container": "#c4abff", "on-background": "#dae2fd", 
        "inverse-primary": "#494bd6", "on-tertiary": "#003640"
      },
      spacing: {
        "space-xxs": "0.25rem", "card-padding-mobile": "1.5rem", "space-3xl": "3.5rem", "space-xs": "0.5rem", 
        "margin-mobile": "1.25rem", "margin-tablet": "2rem", "space-xl": "2rem", "space-sm": "0.75rem", 
        "space-2xl": "2.5rem", "field-gap": "1rem", "section-gap": "1.75rem", "card-padding-desktop": "2.25rem", 
        "space-lg": "1.5rem", "space-md": "1rem"
      },
      fontFamily: {
        "headline-md": ["Plus Jakarta Sans"], "body-md": ["Manrope"], "body-lg": ["Manrope"], 
        "label-md": ["Manrope"], "headline-lg-mobile": ["Plus Jakarta Sans"], "label-sm": ["Manrope"], 
        "label-lg": ["Manrope"], "headline-lg": ["Plus Jakarta Sans"], "display-lg": ["Plus Jakarta Sans"], 
        "headline-sm": ["Plus Jakarta Sans"], "code-mono": ["JetBrains Mono"], "body-sm": ["Manrope"]
      }
    }
  },
  plugins: [],
}