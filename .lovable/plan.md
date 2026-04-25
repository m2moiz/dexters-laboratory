Build Dexter as a polished single-page React + TypeScript + Tailwind app matching the requested retro-modernist design and five-screen flow.

Implementation plan:

1. Replace the placeholder homepage with Dexter
- Use the existing TanStack Start app structure rather than creating a separate Next.js project, while keeping the requested React + TypeScript + Tailwind implementation style.
- Keep all five screens inside the `/` route and switch between them using application state instead of separate routes.
- Update page metadata to reflect Dexter.

2. Add app state and mock data
- Install Zustand.
- Create a single Dexter store with:
  - `currentScreen`
  - `hypothesis`
  - `plan`
  - `currentlySelectedPaper`
  - actions for advancing screens, setting hypothesis, selecting papers, and resetting where needed.
- Create `src/lib/mock-plan.ts` exporting a fully populated sample plan object with Summary, Novelty, Protocol, Materials, Budget, Timeline, Validation, citations, comments, papers, graph nodes, and metrics.

3. Implement the design system
- Load Google Fonts: Fraunces, Inter, and JetBrains Mono.
- Update global CSS variables for:
  - warm cream background `#FCF7EC`
  - deep teal primary `#1B7A8F`
  - red CTA accent `#C73E3A`
  - black border `#1A1A1A`
- Add reusable utility classes/patterns for hard black borders and offset shadows.
- Keep shadcn/ui components where appropriate, especially buttons, cards, textarea, badges/chips, scroll areas, and panels.

4. Build the five screens
- Loading screen:
  - Centered cream layout.
  - “DEXTER” letter-by-letter reveal in Fraunces.
  - Tagline below.
  - Auto-advance after 2 seconds.
- Hypothesis input screen:
  - Centered headline and wide textarea.
  - Helper copy and three uppercase monospace example chips.
  - Chip clicks autofill the textarea.
  - Large red CTA advances to the literature graph.
- Literature graph screen:
  - 60px top bar with hypothesis preview and Continue to Plan button.
  - React Flow graph using mock paper nodes and connecting lines.
  - Right-side details panel slides in when a node is clicked.
- Plan generating screen:
  - Two-column layout.
  - Plan skeleton sections progressively fill with mock content.
  - Monospace activity feed adds lines every 1.5 seconds.
  - Auto-advance to final plan view after 12 seconds.
- Plan view screen:
  - Sticky 80px top banner with hypothesis and three large metrics.
  - Three-column layout: table of contents, plan cards, citations/comments.
  - Highlight table-of-contents section based on scroll position.
  - Bottom red “I’M HAPPY WITH THIS” CTA.

5. Add React Flow dependency and integrate safely
- Install React Flow.
- Use static mock nodes/edges and custom styling to match the Dexter visual language.
- Avoid external data calls; all content remains mock data.

6. Validate the build
- Ensure no placeholder blank app content remains.
- Run formatting/type/build checks after implementation.
- Fix any route, import, or TypeScript issues before finishing.