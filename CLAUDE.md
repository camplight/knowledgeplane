# KnowledgePlane Design System

**Philosophy**: "Digital Archive" — warm scholarly interface with technical precision. JetBrains Mono everywhere, amber/indigo/teal palette, subtle warmth.

---

## Quick Reference

### Colors

| Element | Light | Dark |
|---------|-------|------|
| Primary (Amber) | `#f59e0b` | `#fbbf24` |
| Secondary (Indigo) | `#6366f1` | `#818cf8` |
| Accent (Teal) | `#14b8a6` | `#5eead4` |
| Base-100 | `#faf8f5` | `#111827` |
| Base-200 | `#f1ede7` | `#1f2937` |
| Base-300 | `#e3dcd1` | `#374151` |

### Typography

```css
/* Brand/Logo Only */
--font-brand: 'Space Grotesk', system-ui, sans-serif;

/* All UI Text */
--font-mono: 'JetBrains Mono', 'Courier New', monospace;
```

**Font Sizes**: `text-xl sm:text-2xl lg:text-3xl` (h1), `text-lg sm:text-xl` (h2), `text-sm sm:text-base` (body)

### Spacing

```css
Container: p-4 sm:p-6 lg:p-8
Card: p-4 sm:p-6
Margins: mb-4 sm:mb-6 (section), mb-2 sm:mb-4 (element)
Gaps: gap-4 sm:gap-6 (large), gap-2 sm:gap-4 (medium)
```

### Breakpoints

- `sm: 640px` (tablets)
- `lg: 1024px` (desktop)
- Mobile-first: base → sm → lg

---

## Component Patterns

### Cards
```jsx
<div className="card bg-base-100 shadow-xl border border-base-300">
  <div className="card-body p-4 sm:p-6">
    {content}
  </div>
</div>
```

### Buttons
```jsx
<button className="btn btn-primary btn-sm sm:btn-md">
<button className="btn btn-secondary btn-sm sm:btn-md">
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

### Loading States
```jsx
<span className="loading loading-spinner loading-lg text-primary"></span>
<div className="skeleton h-4 w-full"></div>
```

---

## Layout

### Sidebar
- Expanded: `w-72` (288px)
- Collapsed: `w-24` (96px)
- Mobile: DaisyUI drawer overlay
- Desktop: `lg:drawer-open`

### Navigation
- Height: `h-16` (64px)
- Fixed: `top-0 z-50`
- Content: Logo + Workspace + Theme toggle

### Main Content
- Max width: `max-w-7xl` (dashboard), `max-w-4xl` (forms)
- Margin: `ml-0` (mobile), `ml-24` or `ml-72` (desktop)

---

## Visual Effects

### Gradients
```css
/* Body background */
background-image:
  radial-gradient(circle at 20% 80%, rgba(251, 191, 36, 0.05) 0%, transparent 50%),
  radial-gradient(circle at 80% 20%, rgba(79, 70, 229, 0.05) 0%, transparent 50%);
```

### Shadows
- Card: `shadow-xl`
- Dropdown: `shadow-lg`
- Button hover: `shadow-md`

### Transitions
- All: `duration-300 ease-in-out`
- Consistent across sidebar, buttons, hovers, theme switch

---

## Charts (Recharts)

```jsx
// Colors
Facts: #f59e0b (Amber)
Cards: #6366f1 (Indigo)
Relations: #14b8a6 (Teal)

// Responsive heights
Mobile: h-48, Tablet: h-64, Desktop: h-[280px]

// Gradients
<linearGradient id="colorFacts" x1="0" y1="0" x2="0" y2="1">
  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
</linearGradient>
```

---

## Icons

- Style: Outline stroke, `strokeWidth={2}`
- Sizes: `w-4 h-4` (small), `w-5 h-5` (medium), `w-6 h-6` (large)
- Source: Heroicons inline SVG

```jsx
<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="..." />
</svg>
```

---

## Avatars

```javascript
import md5 from "md5";

const getGravatarUrl = (email: string, size: number = 80) => {
  const hash = md5(email.toLowerCase().trim());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
};
```

Sizes: `w-8 h-8` (small), `w-10 h-10` (medium), `w-12 h-12` (large)
Ring: `ring-2 ring-primary/20`

---

## Accessibility

- All interactive elements have visible focus rings
- All text meets WCAG AA contrast
- ARIA labels on icon buttons: `aria-label="Close menu"`
- Tab navigation works throughout
- Use DaisyUI's built-in focus states

---

## Implementation Rules

### ✅ Always Do
- Use JetBrains Mono for all UI text (Space Grotesk only for logo)
- Use colors from palette (amber/indigo/teal)
- Responsive spacing: `p-4 sm:p-6 lg:p-8`
- Transitions: `duration-300 ease-in-out`
- Mobile-first: base → sm → lg
- Warm backgrounds (not stark white/black)
- Outline icons: `w-5 h-5` or `w-4 h-4`
- Semantic HTML with ARIA labels

### ❌ Never Do
- Generic fonts (Inter, Roboto, Arial)
- Pure white (`#FFFFFF`) or pure black (`#000000`)
- Neon/oversaturated colors
- Heavy glassmorphism or excessive shadows
- Animated gradients or particle backgrounds
- Default DaisyUI colors without customization
- Inconsistent spacing or font sizes
- Skip accessibility (focus states, ARIA)

---

## DaisyUI Customization

```javascript
// tailwind.config.js
daisyui: {
  themes: [{
    light: {
      primary: "#f59e0b",    // Custom amber
      secondary: "#6366f1",  // Custom indigo
      accent: "#14b8a6",     // Custom teal
      "base-100": "#faf8f5", // Warm off-white
      // ... all custom colors
    },
    dark: {
      primary: "#fbbf24",
      secondary: "#818cf8",
      accent: "#5eead4",
      "base-100": "#111827", // Warm dark
    }
  }]
}
```

**What we customize**: Colors, fonts, borders, shadows, animations
**What we keep**: Semantic structure, accessibility, responsive utilities

---

## File Structure

```
apps/webapp/app/
├── components/
│   ├── AppLayout.tsx          # Main layout wrapper
│   ├── Navigation.tsx         # Top navbar
│   ├── Sidebar.tsx            # Collapsible sidebar
│   ├── SidebarContext.tsx     # State management
│   ├── KnowledgePlanesChart.tsx
│   └── WorkspaceSelector.tsx
├── [page]/page.tsx            # Page components
├── globals.css                # Global styles
└── layout.tsx                 # Root layout with fonts
```

---

## Tech Stack

- **DaisyUI**: 5.5.18 (component library)
- **Tailwind CSS**: 4.1.16 (utility-first CSS)
- **Next.js**: App Router
- **Recharts**: Data visualization
- **md5**: Gravatar hashing

---

## Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run type-check # TypeScript check
npm run lint       # ESLint
```

---

## Design Principles

1. **Clarity over cleverness** — obvious interactions
2. **Consistency** — same patterns everywhere
3. **Warmth** — scholarly, not cold tech
4. **Speed** — fast, responsive, minimal loading
5. **Accessibility** — WCAG AA, keyboard nav
6. **Mobile-first** — progressive enhancement

---

---

## Coding Guidelines (Karpathy Principles)

### Context Engineering Rules
- **Keep this file minimal** — only universally applicable rules (LLMs follow ~150-200 instructions effectively)
- **Don't assume** — state assumptions explicitly, ask if uncertain
- **Surface tradeoffs** — present multiple options rather than picking silently
- **Write minimum code** — no speculative features, no abstractions for single-use, no unrequested flexibility
- **Strong success criteria** — clear goals let Claude work independently

### Implementation Philosophy
1. Solve the problem with minimum code
2. No features beyond what was asked
3. No abstractions for single-use code
4. No unrequested configurability
5. Edit existing files over creating new ones
6. Don't create documentation unless explicitly requested

**References**:
- [Karpathy on context engineering](https://x.com/karpathy/status/1937902205765607626)
- [Claude Code best practices](https://arize.com/blog/claude-md-best-practices-learned-from-optimizing-claude-code-with-prompt-learning/)
- [Writing effective CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md)

---

**Updated**: 2026-02-13 | **Maintained by**: Claude Code
