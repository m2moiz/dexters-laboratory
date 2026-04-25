I’ll tune the literature graph animation so it feels less like a settled force layout and more like a living, fluid network.

What typically makes these graphs feel animated:
- A force simulation for structure: links pull related nodes together, collision prevents overlap, charge pushes nodes apart.
- Continuous low-level energy: the simulation is kept warm instead of cooling to a stop.
- Gentle orbital/drift forces: nodes receive tiny changing velocity offsets so they “swim” rather than freeze.
- Visual motion cues: edge pulses, halos, and subtle particle movement make the network feel alive even when node positions move slowly.
- Interaction energy: hovering/dragging/clicking briefly increases simulation energy, so the graph reacts physically.

Plan:
1. Increase the baseline animation energy
   - Raise the minimum simulation alpha so the graph never fully settles.
   - Lower velocity damping so nodes retain motion longer.
   - Increase the sinusoidal/orbital velocity offsets, but keep them bounded so the graph does not fly apart.

2. Add a more “galaxy-like” flow pattern
   - Apply a small rotational force around the graph center.
   - Add per-node phase offsets so every node moves uniquely instead of drifting in lockstep.
   - Add a weak pull back toward the center so the layout stays visible and fitted.

3. Improve perceived motion without breaking readability
   - Speed up the edge pulse animation.
   - Add small moving particles along edges, giving the sense that information is flowing through the network.
   - Add subtle node halos/rings that breathe over time.

4. Keep viewport fitting stable
   - Preserve the existing auto-fit transform.
   - Make the animation more active in graph-space while keeping the whole network inside the canvas.

Technical details:
- Changes will be contained to `src/routes/index.tsx`.
- The existing custom canvas + `d3-force` implementation will remain; no new graph library is needed.
- I’ll adjust the current render loop around lines 301–310, force settings around lines 267–280, and drawing helpers around lines 196–260.
- I’ll avoid SSR-unsafe imports and keep the app compatible with TanStack Start.
- After implementation, I’ll run a build check to catch syntax/type issues.