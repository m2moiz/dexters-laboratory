I’ll update the report interaction so text selection behaves like a real annotation layer instead of disappearing after mouse-up, and I’ll replace the rectangle lasso with a hand-drawn freeform selection experience.

Plan:

1. Make dragged text highlights persist
   - When the user drags across report text, store that selection as a persistent highlight/annotation.
   - Keep the selected passage visibly marked after mouse-up instead of clearing the browser selection with no lasting state.
   - Preserve the current squiggly/hand-marked feel, but make it more intentional: warm translucent highlight first, with a rough wavy underline/marker treatment so it feels hand-annotated.

2. Add “Undo highlight” to the right-click menu
   - If the user right-clicks an already-highlighted passage, show an “Undo highlight” option.
   - Selecting it removes that annotation only, without disturbing other highlights.
   - Keep the existing actions such as “Go to reference,” “Suggest rewrite,” and “Make more rigorous.”

3. Replace rectangle lasso with a true freehand lasso
   - Change the lasso mode from drawing a rectangular box to drawing a freeform path that follows the pointer.
   - Render the path as a sketchy, dashed, slightly imperfect line, matching a rough Excalidraw-style annotation vibe.
   - While drawing, show a subtle warm fill inside/around the selection path and a small “lasso active” cursor/label so it feels deliberate.

4. Use freehand lasso selection logic
   - Track the lasso path points while dragging.
   - On release, determine which report paragraphs/passages intersect or sit inside the drawn shape.
   - Mark those selected passages with the same persistent highlight treatment used for dragged text.

5. Refine the animation and visual style
   - Add a natural “ink settling” animation when highlights are created.
   - Add a hand-drawn lasso stroke animation, as if the line is being drawn in real time.
   - Use the current warm paper palette, teal/primary accent, and amber glow sparingly so the result feels cohesive with the Dexter lab theme while moving toward the rough-but-nice Excalidraw feel.

Technical details:

- Update `PlanViewScreen` in `src/routes/index.tsx` to store persistent annotations rather than only paragraph IDs.
- Replace the current `lasso` rectangle state with freehand path state: an array of pointer coordinates, drawing status, and active mode.
- Render the lasso using an absolutely/fixed-position SVG overlay instead of a `<div>` rectangle.
- Add helper functions for point-in-polygon/intersection-style selection against report text block bounding boxes.
- Update the context menu logic so it detects whether the clicked text block is already highlighted and conditionally includes “Undo highlight.”
- Update `src/styles.css` with sketch-style highlight, rough underline, freehand lasso stroke, lasso fill, and subtle draw/settle animations.