I’ll add intuitive back navigation between Dexter’s workflow screens and move the screen-specific interaction state into the shared store so users can move forward/back without losing their work.

## Recommended button location

The optimal location is the existing top header/action area on each screen:

```text
[Back]    current context / hypothesis                         [Continue]
```

Why this fits best:
- It matches the existing “Continue to Plan” placement instead of introducing a new control pattern.
- Back belongs on the left, forward belongs on the right, which is the most natural reading/navigation flow.
- It keeps the canvas/report area uncluttered and doesn’t compete with node details, lasso tools, or report text selection.
- On mobile, the controls can stack or remain compact in the header without blocking content.

## Implementation plan

1. **Add workflow navigation helpers**
   - Define the ordered workflow screens: hypothesis input → literature graph → plan generation → report view.
   - Add `goToPreviousScreen` / `goToNextScreen` style helpers in the Zustand store, or explicit actions for the few transitions.
   - Keep the loading intro out of normal back navigation.

2. **Add a reusable navigation bar/control**
   - Create a consistent “Back” button treatment that uses the same industrial/Dexter visual language as the current buttons.
   - Place it in the left side of screen headers, with forward/continue actions on the right.
   - On the first input screen, either hide Back or disable it so there’s no confusing dead action.

3. **Preserve hypothesis input state**
   - The hypothesis already lives in the shared store, so it should remain when moving from the graph back to the first screen.
   - I’ll keep that behavior and ensure no transition resets it.

4. **Preserve literature graph state**
   - Move these currently local graph states into the shared Dexter store:
     - visited/read node IDs
     - bookmarked node IDs
     - selected/open paper
   - This makes node reads/bookmarks survive when users go to report generation/report view and return.

5. **Preserve report interaction state where useful**
   - Keep report highlights/annotations local unless you want them preserved when going back to graph and returning to report.
   - Recommended: preserve them too, because they are user-created edits. I’ll move highlights and active reference state into the store so report selections don’t disappear across navigation.

6. **Adjust plan generation back behavior**
   - Add a Back button on the generating screen so users can return to the graph while generation is in progress.
   - If they leave the generating screen, its timers will cleanly stop. Returning to it can restart the generation animation without clearing graph/hypothesis state.

7. **Build verification**
   - Run the build after changes to catch TypeScript and routing issues.

## Technical notes

- Changes will mainly touch `src/lib/dexter-store.ts` and `src/routes/index.tsx`, with small styling additions in `src/styles.css` if needed.
- I’ll avoid changing the TanStack route structure since this is an in-app workflow, not separate URL pages.
- The forward/back buttons will use existing `Button` styling and the current warm industrial theme.