# 15 — UX Guidelines

Princípy a konkrétne vzory pre web UI. Cieľ: **shadcn default look**, **accessibility-first**, konzistentné a predvídateľné.

## Princípy

1. **Defaults first.** Kým nie je produktový dôvod custom — nič nepassuje. Použi shadcn presets, Radix primitivy, Tailwind tokens.
2. **Predvídateľnosť > originalita.** Rovnaký interakčný vzor (napr. edit form) vyzerá a správa sa rovnako naprieč všetkými stránkami.
3. **Nenechaj usera čakať v tme.** Každá async akcia má loading state, každý empty state má actionable message, každý error má next step.
4. **Keyboard first.** Všetko, čo sa dá urobiť myšou, sa musí dať klávesnicou.
5. **Access before styling.** Sémantický HTML + aria labels píšeme **pred** vizuálnymi úpravami, nie retrofit.

## shadcn setup

- **Style:** `new-york` (ostrejšie, kompaktnejšie — vhodné pre admin)
- **Base color:** `slate`
- **Radius:** `0.5rem` (default)
- **Icons:** `lucide-react`
- **Font:** system stack (default `font-sans` z Tailwind) — rýchle, žiadne FOUT. Keď neskôr branding: Geist.
- Components add-uje sa cez `pnpm dlx shadcn@latest add <name>` do `packages/ui/src/components/`.
- Dark mode: `next-themes`, provider v root layoute, toggle v user menu. Default = `system`.

## Typografia

Default Tailwind scale. Konvencie:
- Page title: `text-2xl font-semibold tracking-tight`
- Section title: `text-lg font-semibold`
- Body: `text-sm` (shadcn default pre admin)
- Muted text: `text-sm text-muted-foreground`
- Code: `font-mono text-sm bg-muted px-1.5 py-0.5 rounded`

## Spacing & layout

- Sidebar width: 240px (collapsed rail 56px)
- Content max-width pre forms: 720px
- Content max-width pre tables: full
- Default gap vertikálne: `space-y-4` (sekcie) / `space-y-2` (inputs)
- Horizontal padding: `px-6` desktop, `px-4` mobile
- Cards: `p-6`, medzi kartami `gap-4`

## Accessibility (WCAG 2.1 AA minimum)

### Semantika

- Správne landmarks: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`
- Nadpisy hierarchicky: jeden `<h1>` per stránka, `<h2>` sekcie, nie preskakovať úrovne
- Lists ako `<ul>`/`<ol>`, nie `<div>`
- Buttons pre akcie, links (`<a>`) pre navigáciu

### Keyboard

- **Tab order** sedí s vizuálnym flow
- Focus indicators viditeľné **všade** (shadcn má `focus-visible:ring-2 focus-visible:ring-ring` — nezrušiť)
- `Esc` zatvára dialógy, popovers, command palette
- `Enter` submituje forms, aktivuje primary actions v dialógoch
- `Space` toggluje checkboxes a switches
- Šípky v menu / listboxoch / tabs
- `⌘K` / `Ctrl+K` = command palette (global)
- `/` v listoch = focus search input
- Shortcuts visible v UI cez `<kbd>` badges v menu items

### ARIA

- `aria-label` na icon-only buttonoch (napr. kebab `⋮` = `aria-label="Row actions"`)
- `aria-live="polite"` na toast container (shadcn sonner to už robí)
- `aria-busy="true"` na containers počas loading
- `aria-expanded`, `aria-controls` na disclosure patterns
- Form inputs vždy s `<label>` (aj cez sr-only ak label nie je viditeľný)
- Error messages linknuté cez `aria-describedby`

### Kontrast a farby

- Text vs pozadie: min 4.5:1 (body), 3:1 (large text)
- Status farby (error, warning, success) **nikdy nie sú jediný nositeľ informácie** — vždy s ikonou alebo textom
- Dark mode: shadcn default palety už spĺňajú AA

### Screen reader testing

- Live viewer: nové eventy v timeline pridávaj s `aria-live="polite"` (ale throttled — nie každý chunk, iba "complete" events)
- Tables: `<th scope="col">` / `<th scope="row">`

## Patterns

### Forms

- **Library:** `react-hook-form` + `zod` resolver (shadcn `Form` komponent)
- **Validácia:** pri blur pre individuálne polia, pri submit pre celý form
- **Submit button:** disabled kým form nie je valid + pristine, počas submitu `loading` state (spinner + text "Saving…")
- **Error messages:** inline pod polom, `text-sm text-destructive`
- **Required fields:** `*` za labelom, `aria-required="true"` na inpute
- **Auto-save** kde dáva zmysel (agent editor draft): status indicator "Saved" / "Saving…" / "Unsaved changes"

### Loading states

- **<200 ms:** nič (nerušme users flashmi)
- **200ms – 1s:** skeleton (shadcn `Skeleton`) pre content, pre buttony jemný spinner
- **>1s:** progress indicator ak vieme progress, inak skeleton + jemný "Loading…" helper
- **SSE streamed content:** append inkrementálne, bez celkového skeletonu

### Empty states

Každý zoznam / stránka bez dát má:
- Ilustrácia alebo ikona (jednoduchá, monochromatická)
- Krátky H2 title ("No agents yet")
- Description 1-2 vety ("Create your first agent to get started.")
- Primary CTA
- Optional secondary link (docs, tutorial)

### Error states

- **Field error:** inline, pod inputom
- **Form-level error:** shadcn `Alert` variant="destructive" nad submit button
- **Page-level error:** error boundary → celá stránka s retry, go home, contact support links
- **Toast error:** krátke non-blocking (napr. "Failed to delete — please retry"). Nie pre validation, iba pre unexpected
- **Run error / tool error:** inline v timeline, nie toast (je to obsahová informácia)

### Confirmations (destructive actions)

- `AlertDialog` (shadcn) — **nie** window.confirm
- Title: "Delete agent?"
- Description: čo sa stane, čo sa nestratí, čo sa nedá vrátiť
- Actions: `Cancel` (secondary) + `Delete` (destructive variant)
- Pri kritických: typed confirmation ("Type the agent name to confirm")

### Toasts (sonner)

- **Success:** "Agent saved"  — 3 s
- **Info:** "Your invite was sent" — 4 s
- **Error:** "Failed to save. Retry?" — 6 s, s action button
- Neskladuj toasty za sebou viac ako 3 naraz — batchuj alebo queue

### Tables

- shadcn `DataTable` wrapper nad TanStack Table
- Column visibility toggle (vpravo hore)
- Sort na clickable headers (šípka indikátor)
- Pagination: cursor-based ("Previous / Next"), nie page numbers pre veľké datasety
- Row actions cez `⋮` menu (DropdownMenu), **nie** inline tlačidlá — krížia sa s row click
- Row click → detail (ak má row `href`-ekvivalent)
- Empty state v table body

### Live data (SSE)

- **Auto-scroll:** iba ak user je na bottome; ak scrolluje hore, pozastav a ukáž "N new events — click to scroll"
- **Reconnect logic:** auto, exponential backoff, max 5 pokusov. UI: "Connection lost — reconnecting…"
- **Performance:** virtualizuj list ak >500 eventov (react-virtual)

### Optimistic UI

Bezpečné prípady: toggle enable/disable, mark as read, rename. Pattern:
1. UI reflect change okamžite
2. Request v pozadí
3. Pri failure: rollback + toast "Couldn't update. Please retry."

**Nepoužívať** pre destructive actions (delete), creation (chceme real ID), payment.

### Command palette (⌘K)

- shadcn `Command` komponent
- Sekcie: Actions (create, go to…), Agents, Runs, MCP servers, …
- Fuzzy search cez `cmdk` default
- Recent items top
- Shortcuts na rýchlejší prístup (`⌘K` + `g a` = go to agents, atď. — Linear-style; optional Phase 2)

### Dialog / Drawer

- `Dialog` pre krátke formy (<5 polí), confirmations, quick views
- `Sheet` (side drawer) pre zložitejšie forms, detail views, bez straty context-u listu
- `Popover` pre menšie tools (filters, date pickers)
- Nikdy nested dialogs — ak treba, prvý zatvoriť, druhý otvoriť

### Copy-to-clipboard

- API keys, run IDs, endpointy: clickable copy button s ikonou + toast "Copied" na feedback
- Masking: API key zobrazený ako `agx_abc12345_•••••••` s copy buttonom pre full hodnotu

## Responsive breakpoints

Tailwind default:
- `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536
- Admin app primárne `lg+`. Mobile `<lg` je "read-only sensible" — dashboard, execution viewer, chat. Editory ostávajú desktop-first.

## Internationalization (i18n) setup

Aj keď MVP = iba EN, od začiatku cez `next-intl`:
- UI strings v `messages/en.json`
- Komponenty používajú `useTranslations('namespace')`
- Formatovanie dátumov/čísel cez `next-intl` API
- Pridanie SK/CS neskôr = len nový messages file + routing

## Icons

- `lucide-react` only (shadcn default)
- Size default 16 (inline), 20 (buttony), 24 (headers)
- Nie emoji v UI (okrem user-generated content napr. agent description ak user emoji napíše)

## Animations

- shadcn / Radix defaults (300 ms transitions)
- `prefers-reduced-motion` respect — Tailwind má `motion-safe:` / `motion-reduce:` variants
- Žiadne decoratívne animácie (hover shimmer, scroll-based) — distract v admin UI

## Avatar & user representation

- Email-based gravatar alebo initials fallback (shadcn `Avatar`)
- Org avatar: prvé dve písmená v squared background

## Date/time formatovanie

- Relatívne (<24h): "3 min ago", "2 hours ago" — s absolute tooltip
- Dlhšie: "Apr 14, 12:34" (locale-aware cez next-intl)
- Ever vždy v ISO pri exportoch a debug tooltipoch

## Notifications (in-app bell)

- Dropdown z topbaru
- Kategórie: run failed, credential expiring, invite received
- Mark as read on click
- "Mark all read" action
- Deep-link na relevant page

## Developer experience guardrails

- Každá stránka má error boundary
- 404 a 500 pages sú shadcn-styled, nie default Next.js
- Loading UI (`loading.tsx` Next.js) pre route transitions
- Prefetch na hover pre nav links (Next.js default)

## Analytics / UX tracking (phase 2+)

- PostHog self-hosted — track page views + key actions (agent_created, run_started, mcp_connected)
- **Žiadne** session replay s citlivými vstupmi (alebo s aggressive masking)

## Inspiration folder

`docs/wonderful/` obsahuje screenshoty UI ktoré nám vizuálne sedia. Pri tvorbe novej obrazovky pozri tam, ale **zachovaj shadcn default styling** — ber odtiaľ len layout / UX patterns, nie farby / radius / typografiu.
