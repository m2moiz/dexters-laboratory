Plan to update the initial loading screen animation

1. Replace the current “DEXTER” letter reveal
- Remove the simple text-only loading treatment from the first screen.
- Replace it with a short animated “lab opening” sequence that still feels native to the app’s current industrial/scientific visual style.

2. Create a Dexter’s Laboratory-inspired homage without copying exact assets
- Use abstract lab motifs: sliding mechanical doors, teal-blue instrument panels, blinking indicator lights, schematic grid lines, flask/test-tube silhouettes, and a central “DEXTER LABORATORY” lockup.
- Keep it as a visual homage rather than using copyrighted show artwork or characters.
- Keep the color language aligned with the app: cream paper background, black industrial outlines, teal-blue primary accents, and restrained red/orange only if needed for tiny indicator lights.

3. Make the animation feel like an opening sequence
- Sequence the motion in stages:
  - background grid and lab panels fade/slide in
  - mechanical doors or shutters open
  - small lab lights blink and instruments pulse
  - “DEXTER’S LABORATORY” appears as the final title moment
  - transition smoothly into the hypothesis input screen
- Maintain the existing automatic transition timing, but likely extend it slightly from ~2s to ~3–3.5s so the opening has enough time to read.

4. Add CSS keyframes/utilities in the existing style system
- Add custom keyframes in `src/styles.css` for door opening, panel slide, blinking lights, title reveal, scan-line movement, and subtle instrument pulsing.
- Keep animations CSS-based for smoothness and avoid adding dependencies.

5. Update only the loading screen component
- Modify `LoadingScreen` in `src/routes/index.tsx` to render the new animated lab composition.
- Preserve the existing store flow so the app still automatically advances to `HYPOTHESIS_INPUT` after the intro.
- Ensure the design remains responsive for the current preview size and smaller screens.

Technical notes
- Files to edit: `src/routes/index.tsx` and `src/styles.css`.
- No new route files or package dependencies are needed.
- I will verify with a production build after implementation.