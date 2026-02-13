# KnowledgePlane - Design System & Development Guidelines

## 🎨 Aesthetic Configuration

### Design Philosophy: "Digital Archive"
A warm, scholarly interface that evokes the feeling of a well-organized knowledge archive. Combines technical precision with human warmth.

---

## Color Palette

### Light Theme
```css
Primary:    #f59e0b  /* Amber - warm, archive-like */
Secondary:  #6366f1  /* Indigo - deep, scholarly */
Accent:     #14b8a6  /* Teal - technical accent */
Neutral:    #3d4451  /* Dark slate */
Base-100:   #faf8f5  /* Warm off-white, like aged paper */
Base-200:   #f1ede7  /* Slightly darker warm */
Base-300:   #e3dcd1  /* Even darker warm tone */
Info:       #3b82f6
Success:    #10b981
Warning:    #f59e0b
Error:      #ef4444
```

### Dark Theme
```css
Primary:    #fbbf24  /* Brighter amber for dark */
Secondary:  #818cf8  /* Lighter indigo */
Accent:     #5eead4  /* Bright teal */
Neutral:    #1f2937
Base-100:   #111827  /* Very dark blue-gray */
Base-200:   #1f2937
Base-300:   #374151
Info:       #60a5fa
Success:    #34d399
Warning:    #fbbf24
Error:      #f87171
```

---

## Typography

### Font Stack
```css
/* Brand/Logo Only */
--font-brand: 'Space Grotesk', system-ui, sans-serif;

/* All Other Text */
--font-mono: 'JetBrains Mono', 'Courier New', monospace;
--font-sans: 'JetBrains Mono', 'Courier New', monospace;
```

### Rationale
- **JetBrains Mono**: Clean, technical, highly readable monospace for all UI text
- **Space Grotesk**: Modern geometric sans-serif for brand identity (logo only)
- Monospace creates consistent rhythm and professional feel
- Avoids generic "AI slop" fonts (Inter, Roboto, Arial)

### Font Sizes (Responsive)
```css
/* Headings */
h1: text-xl sm:text-2xl lg:text-3xl
h2: text-lg sm:text-xl lg:text-2xl
h3: text-base sm:text-lg lg:text-xl

/* Body */
body: text-sm sm:text-base
small: text-xs sm:text-sm

/* Stats/Numbers */
stats: text-lg sm:text-2xl
```

---

## Spacing System

### Padding (Responsive)
```css
Container: p-4 sm:p-6 lg:p-8
Card:      p-4 sm:p-6
Tight:     p-2 sm:p-3
```

### Margins
```css
Section:   mb-4 sm:mb-6
Element:   mb-2 sm:mb-4
Tight:     mb-1 sm:mb-2
```

### Gaps
```css
Large:  gap-4 sm:gap-6
Medium: gap-2 sm:gap-4
Small:  gap-1 sm:gap-2
```

---

## Component Patterns

### Cards
```jsx
<div className="card bg-base-100 shadow-xl border border-base-300">
  <div className="card-body p-4 sm:p-6">
    {/* content */}
  </div>
</div>
```

### Buttons
```jsx
/* Primary Action */
<button className="btn btn-primary btn-sm sm:btn-md">

/* Secondary */
<button className="btn btn-secondary btn-sm sm:btn-md">

/* Ghost */
<button className="btn btn-ghost btn-sm">
```

### Stats
```jsx
<div className="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100 border border-base-300">
  <div className="stat">
    <div className="stat-value text-primary">{value}</div>
    <div className="stat-title">Label</div>
  </div>
</div>
```

---

## Layout Guidelines

### Sidebar
- **Expanded**: 288px (w-72)
- **Collapsed**: 96px (w-24)
- **Mobile**: Overlay with backdrop (DaisyUI drawer)
- **Desktop**: Persistent sidebar (lg:drawer-open)

### Navigation
- **Height**: 64px (h-16)
- **Fixed**: top-0 z-50
- **Content**: Logo + Workspace + Theme toggle

### Main Content
- **Max Width**: max-w-7xl (Dashboard), max-w-4xl (Forms)
- **Responsive Margin**:
  - Mobile: ml-0
  - Desktop: ml-24 (collapsed) or ml-72 (expanded)

---

## Responsive Breakpoints

```css
/* Tailwind defaults */
sm:  640px   /* Small tablets */
md:  768px   /* Tablets */
lg:  1024px  /* Small laptops */
xl:  1280px  /* Desktops */
2xl: 1536px  /* Large screens */
```

### Mobile-First Strategy
- Base styles for mobile (320px+)
- Add complexity at larger breakpoints
- Hide secondary content on mobile
- Stack layouts vertically on small screens

---

## Visual Effects

### Gradients
```css
/* Background */
background-image:
  radial-gradient(circle at 20% 80%, rgba(251, 191, 36, 0.05) 0%, transparent 50%),
  radial-gradient(circle at 80% 20%, rgba(79, 70, 229, 0.05) 0%, transparent 50%);

/* Sidebar */
background-image:
  radial-gradient(circle at 50% 50%, rgba(251, 191, 36, 0.03) 0%, transparent 70%);
```

### Shadows
```css
Card:      shadow-xl
Dropdown:  shadow-lg
Button:    shadow-md (on hover)
```

### Transitions
```css
Duration:  duration-300
Easing:    ease-in-out
```

---

## Icons

### Style
- Outline stroke icons (strokeWidth={2})
- Size: w-4 h-4 (small), w-5 h-5 (medium), w-6 h-6 (large)
- Source: Heroicons (via inline SVG)

### Usage
```jsx
<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="..." />
</svg>
```

---

## Chart Styling (Recharts)

### Colors
```jsx
Facts:     #f59e0b (Amber)
Cards:     #6366f1 (Indigo)
Relations: #14b8a6 (Teal)
```

### Gradients
```jsx
<linearGradient id="colorFacts" x1="0" y1="0" x2="0" y2="1">
  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
</linearGradient>
```

### Responsive Heights
```css
Mobile:  h-48  (192px)
Tablet:  h-64  (256px)
Desktop: h-[280px]
```

---

## Avatar & Images

### Gravatar Integration
```javascript
import md5 from "md5";

const getGravatarUrl = (email: string, size: number = 80) => {
  const hash = md5(email.toLowerCase().trim());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
};
```

### Avatar Sizes
```css
Small:  w-8 h-8
Medium: w-10 h-10
Large:  w-12 h-12
```

### Ring Styling
```css
ring-2 ring-primary/20 ring-offset-2 ring-offset-base-100
```

---

## Loading States

### Spinner
```jsx
<span className="loading loading-spinner loading-sm text-primary"></span>
<span className="loading loading-spinner loading-md text-primary"></span>
<span className="loading loading-spinner loading-lg text-primary"></span>
```

### Skeleton
```jsx
<div className="skeleton h-4 w-full"></div>
<div className="skeleton h-32 w-full"></div>
```

---

## Empty States

### Pattern
```jsx
<div className="text-center py-12">
  <svg className="w-12 h-12 mx-auto mb-4 text-base-content/30">
    {/* icon */}
  </svg>
  <p className="text-sm font-medium text-base-content/50 font-mono">
    Primary message
  </p>
  <p className="text-xs text-base-content/40 mt-2 font-mono">
    Secondary description
  </p>
  <button className="btn btn-primary btn-sm mt-4">
    Call to Action
  </button>
</div>
```

---

## Accessibility

### ARIA Labels
```jsx
<button aria-label="Close menu">
<input aria-describedby="help-text">
```

### Focus States
- All interactive elements have visible focus rings
- Use DaisyUI's built-in focus states
- Tab navigation works throughout

### Color Contrast
- All text meets WCAG AA standards
- Primary actions use high-contrast colors
- Dark mode tested for readability

---

## DaisyUI Components Used

### Core Components
- `navbar` - Top navigation
- `drawer` - Mobile sidebar overlay
- `card` - Content containers
- `btn` - Buttons
- `stats` - Statistics display
- `dropdown` - Menus
- `alert` - Notifications
- `badge` - Status indicators
- `loading` - Spinners
- `skeleton` - Loading placeholders

### Forms
- `input` - Text inputs
- `textarea` - Multi-line text
- `select` - Dropdowns
- `checkbox` - Toggles
- `label` - Form labels

---

## Anti-Patterns to Avoid

### ❌ Don't Use
- Generic fonts (Inter, Roboto, Arial, Helvetica)
- Over-saturated colors or neon accents
- Excessive gradients or glassmorphism
- Too many font weights or styles
- Inconsistent spacing
- Non-semantic HTML

### ✅ Do Use
- Monospace for consistency
- Warm, muted colors
- Subtle gradients for depth
- Consistent font system
- Responsive spacing system
- Semantic HTML with ARIA

---

## File Organization

```
apps/webapp/app/
├── components/
│   ├── AppLayout.tsx          # Main layout wrapper
│   ├── Navigation.tsx         # Top navbar
│   ├── Sidebar.tsx            # Collapsible sidebar
│   ├── SidebarContext.tsx     # Sidebar state management
│   ├── KnowledgePlanesChart.tsx # Growth chart
│   └── WorkspaceSelector.tsx  # Workspace dropdown
├── [page]/
│   └── page.tsx               # Page components
├── globals.css                # Global styles
└── layout.tsx                 # Root layout
```

---

## Development Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Type check
npm run type-check

# Lint
npm run lint
```

---

## Key Dependencies

```json
{
  "daisyui": "^5.5.18",
  "tailwindcss": "^4.1.16",
  "recharts": "^2.x",
  "md5": "^2.x"
}
```

---

## Design Principles

1. **Clarity over cleverness** - Obvious interactions, clear labels
2. **Consistency** - Same patterns everywhere
3. **Warmth** - Digital Archive aesthetic, not cold tech
4. **Efficiency** - Fast, responsive, minimal loading
5. **Accessibility** - Works for everyone
6. **Mobile-first** - Start small, enhance for desktop

---

## Resources

- [DaisyUI Documentation](https://daisyui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Recharts](https://recharts.org/)
- [Heroicons](https://heroicons.com/)
- [Space Grotesk Font](https://fonts.google.com/specimen/Space+Grotesk)
- [JetBrains Mono Font](https://www.jetbrains.com/lp/mono/)

---

**Last Updated**: 2026-02-13
**Maintained by**: Claude Code

---

_This design system ensures consistency across the KnowledgePlane application and serves as a reference for all future UI development._
