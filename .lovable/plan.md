Plan to improve the Dexter literature graph

1. Make the graph feel alive
- Replace the current static node positions with an animated force-style layout.
- Nodes will gently drift/pulse around their starting positions so the graph feels active and computational.
- Add motion that pauses/settles when a user drags a node, then resumes subtly afterward.

2. Add weighted relationships
- Extend the mock graph edge data with `weight` values.
- Use edge weight to control visual and spatial meaning:
  - stronger relationships: shorter apparent distance, thicker/darker edge
  - weaker relationships: longer apparent distance, thinner/lighter edge
- Show edge labels or subtle metadata only where it improves clarity, without cluttering the graph.

3. Add node size variation
- Extend paper nodes with an `influence` or `relevance` score.
- Map that score to node diameter, so highly relevant/influential papers appear larger.
- Keep selected nodes visually distinct using Dexter’s red accent while preserving the black-border industrial style.

4. Enable interaction
- Turn node dragging back on so users can move papers with the mouse.
- Keep node click behavior for opening the right-side paper panel.
- Ensure dragging does not accidentally make the detail panel feel broken or overly sensitive.

5. Improve visual polish
- Use curved/smooth edges instead of plain straight lines.
- Add animated edge strokes or subtle moving dash patterns for a research-network feel.
- Style the React Flow canvas to match the Dexter system: cream background, black grid, hard node shadows, teal/red accents.

Technical details
- Update `src/lib/mock-plan.ts` types and mock data:
  - add `weight` to edges
  - add `influence` or `relevance` to papers
- Update `src/routes/index.tsx` graph rendering:
  - use React Flow controlled `nodes`/`edges` state
  - enable `nodesDraggable`
  - add an animation loop with `requestAnimationFrame`
  - vary node size and edge styling based on mock weights/scores
- Add graph-specific CSS utilities/keyframes in `src/styles.css` for subtle node/edge animation and React Flow overrides.
- Verify the app still builds successfully after the change.