# Design System

## Font

**Primary:** Outfit (Google Fonts)
- Loaded via `next/font/google` with CSS variable `--font-outfit`
- Applied globally through Tailwind's `--font-sans` theme token

## Color Tokens

All colors are defined as CSS custom properties in `globals.css` and mapped to Tailwind classes via `@theme inline`.

### Primary (Emerald)

| Token | Hex | Tailwind Class | Usage |
|---|---|---|---|
| `--primary` | `#059669` | `bg-primary`, `text-primary` | Buttons, active nav, links |
| `--primary-hover` | `#047857` | `bg-primary-hover` | Button hover states |
| `--primary-light` | `#ecfdf5` | `bg-primary-light` | Selected states, highlights |
| `--primary-border` | `#6ee7b7` | `border-primary-border` | Bordered button groups |

### Semantic Colors

| Token | Hex | Tailwind Class | Usage |
|---|---|---|---|
| `--success` | `#16a34a` | `text-success` | Income amounts, positive indicators |
| `--success-light` | `#f0fdf4` | `bg-success-light` | Balanced/positive backgrounds |
| `--danger` | `#dc2626` | `text-danger` | Over-budget, errors, deletions |
| `--danger-light` | `#fef2f2` | `bg-danger-light` | Error backgrounds |
| `--warning` | `#eab308` | `text-warning` | Pending badges, upcoming due dates |
| `--warning-light` | `#fefce8` | `bg-warning-light` | Warning backgrounds |
| `--info` | `#2563eb` | `text-info` | Info toasts |
| `--info-light` | `#eff6ff` | `bg-info-light` | Info backgrounds |

### Accent Colors

| Token | Hex | Tailwind Class | Usage |
|---|---|---|---|
| `--accent-orange` | `#f97316` | `bg-accent-orange` | Uncategorized badge |
| `--accent-orange-light` | `#fff7ed` | `bg-accent-orange-light` | Uncategorized backgrounds |
| `--accent-orange-border` | `#fdba74` | `border-accent-orange-border` | Orange borders |
| `--accent-purple` | `#9333ea` | `text-accent-purple` | Split transactions, analytics |
| `--accent-purple-light` | `#faf5ff` | `bg-accent-purple-light` | Split/analytics backgrounds |

### Surface & Layout

| Token | Hex | Tailwind Class | Usage |
|---|---|---|---|
| `--surface` | `#ffffff` | `bg-surface` | Card/panel backgrounds |
| `--surface-secondary` | `#f9fafb` | `bg-surface-secondary` | Page backgrounds |
| `--border` | `#e5e7eb` | `border-border` | Default borders |
| `--border-strong` | `#d1d5db` | `border-border-strong` | Emphasis borders, inputs |

### Text

| Token | Hex | Tailwind Class | Usage |
|---|---|---|---|
| `--text-primary` | `#111827` | `text-text-primary` | Headings, primary content |
| `--text-secondary` | `#4b5563` | `text-text-secondary` | Body text, labels |
| `--text-tertiary` | `#9ca3af` | `text-text-tertiary` | Muted text, placeholders |

### Sidebar

| Token | Hex | Usage |
|---|---|---|
| `--sidebar-bg` | `#111827` | Sidebar background |
| `--sidebar-border` | `#1f2937` | Sidebar dividers |
| `--sidebar-hover` | `#1f2937` | Nav item hover |
| `--sidebar-text-muted` | `#9ca3af` | Inactive nav text |

## Semantic Color Rules

- **Green** (`success`): Income amounts, under-budget, positive trends
- **Red** (`danger`): Over-budget, errors, expense warnings, delete actions
- **Yellow** (`warning`): Upcoming due dates, underutilized categories
- **Orange** (`accent-orange`): Uncategorized/untracked transactions
- **Purple** (`accent-purple`): Split transactions, analytics features
- **Emerald** (`primary`): All primary actions, active states, CTA buttons

## Button Styles

| Type | Classes |
|---|---|
| Primary | `bg-primary text-white hover:bg-primary-hover` |
| Secondary | `border border-border-strong text-text-secondary hover:bg-surface-secondary` |
| Danger | `text-danger hover:bg-danger-light` |
| Ghost | `text-text-tertiary hover:text-text-secondary` |

## Component Patterns

### Cards
`bg-surface rounded-lg shadow p-6`

### Inputs
`border border-border-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-primary`

### Badges
- Status: `px-2 py-0.5 text-xs font-medium rounded-full` with semantic color bg/text
- Count: `bg-accent-orange text-white text-xs rounded-full`

### Modals
`fixed inset-0 bg-black/50` overlay with `bg-surface rounded-xl shadow-2xl` content

### Toast Notifications
- Border-top accent style (`border-t-4`) with semantic color borders
- Auto-dismiss after 4 seconds
- Types: `success`, `error`, `warning`, `info`

### Auth Pages (Sign-in / Sign-up)
- Background: `bg-surface-secondary` with animated diagonal repeating "Budget App" text
- Diagonal text: 45° rotation, `text-primary` at 4–7% opacity, varying sizes and gaps
- Animation: Alternating `scroll-left` / `scroll-right` keyframes (240–320s), defined in `globals.css`
- Clerk components themed via `appearance` prop with Emerald variables (`colorPrimary: #059669`, Outfit font)
- Card: `shadow-xl border border-border`

### Progress Bars
- Default: `bg-success shadow-[0_0_2px_rgba(16,185,129,0.4)]`
- Over budget: `bg-danger shadow-[0_0_2px_rgba(239,68,68,0.4)]`
- Track: `bg-surface-secondary rounded-full`

### Onboarding Pages
- Standalone layout (no DashboardLayout): `h-screen bg-surface-secondary flex flex-col overflow-hidden`
- Content area: `flex-1 overflow-y-auto px-6 py-8` with `max-w-2xl mx-auto`
- Progress bar: 6 segments with `bg-success` (completed), `bg-primary` (current), `bg-border` (upcoming)
- Step header: `text-sm text-text-tertiary` with skip button
- Concept cards: `bg-surface rounded-xl shadow-md p-6` with icon circles (`w-14 h-14 rounded-full bg-primary/10`)
- Suggested item/transaction badges: `text-xs border border-primary/30 text-primary bg-primary/5 px-3 py-1.5 rounded-full hover:bg-primary/10`
- Category expanders: `bg-surface rounded-xl shadow-md` with expand/collapse toggle

## Category Emojis

| Category | Emoji |
|---|---|
| Income | 💰 |
| Giving | 🤲 |
| Household | 🏠 |
| Transportation | 🚗 |
| Food | 🍽️ |
| Personal | 👤 |
| Insurance | 🛡️ |
| Saving | 💵 |

- 🔄 indicates a budget item linked to a recurring payment
