Plan to fix the Dexter literature graph

1. Use a graph visualization library built for force networks
- Add `react-force-graph-2d`, which is designed for animated force-directed graph layouts.
- Replace the current React Flow canvas in the literature graph screen with a canvas-based force graph.
- Keep React Flow available in the project if other screens ever need it, but stop using it for this graph because it is better for node editors/workflows than fluid network eye-candy.

2. Make the network layout feel organic and non-overlapping
- Configure physical forces rather than manually moving nodes:
  - link distance based on edge weight: stronger links pull nodes closer, weaker links sit farther apart
  - collision radius based on node size so large nodes do not overlap
  - charge/repulsion so clusters breathe instead of stacking
  - center force so the graph stays composed in the canvas
- Reheat/restart the simulation when the graph loads so it settles into a natural network shape.

3. Upgrade visual rendering for eye candy
- Draw nodes as custom canvas circles with:
  - influence-based radius
  - black industrial outline
  - hard offset shadow
  - teal/cream/red Dexter palette
  - concise paper IDs/short labels inside or near nodes
- Draw edges as custom curved lines rather than rigid straight connectors.
- Map edge weight to stroke width, opacity, and distance so the visual hierarchy is obvious.
- Add subtle animated edge flow/highlight using a time-based canvas redraw so connections feel alive.

4. Preserve interaction
- Keep click-to-open paper detail panel.
- Enable mouse dragging with physics: dragged nodes move naturally and then rejoin the simulation.
- Add hover affordances: cursor changes, node emphasis, and optional neighboring-edge glow.
- Keep the “Continue to Plan” top bar and slide-in paper panel unchanged.

5. Make it fit the current app
- Keep the existing mock data shape where possible (`papers`, `edges`, `influence`, `weight`).
- Update only what is needed in `src/routes/index.tsx`, `src/styles.css`, and package dependencies.
- Ensure it works within the current TanStack Start + React 19 setup and strict TypeScript.
- Run a production build after implementation to catch dependency/import/type issues.

Technical details
- Install: `react-force-graph-2d`.
- Replace `ReactFlow`, `Node`, `Edge`, `useNodesState`, and manual `requestAnimationFrame` node position logic with `ForceGraph2D` and refs.
- Define graph data as:
```text
nodes: [{ id, paper, influence, val }]
links: [{ source, target, weight }]
```
- Configure d3 forces through the graph ref, especially `link.distance(...)`, `charge.strength(...)`, and `collide.radius(...)`.
- Use `nodeCanvasObject` and `linkCanvasObject` for Dexter-styled custom drawing.
- Use `onNodeClick`, `onNodeHover`, and built-in draggable behavior for interaction.