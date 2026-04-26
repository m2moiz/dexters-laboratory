Yes — I understand. You want the generated plan/report to stop feeling like stacked UI blocks and instead read like a real document: flowing report text, warm paper-like styling, selectable passages, and an editor-style contextual menu for references and targeted rewrite instructions.

Plan:

1. Redesign the report view as a warm, readable document
   - Replace the current block/card layout in the generated report page with a single report-paper surface.
   - Keep the current app font system, but use it more like a polished research report: title, abstract/hypothesis, section headings, body paragraphs, citations, and margin notes.
   - Use the existing warm cream/card theme with subtle teal/industrial accents, avoiding heavy boxed sections.

2. Make report text interactively selectable
   - Render each sentence/paragraph as selectable text instead of isolated cards.
   - Track selected text and its location in the report.
   - When text is selected, apply an initial highlight while selecting, then convert the selected passage into a squiggly underline treatment so it feels like an annotated manuscript.

3. Add a custom right-click/context menu
   - On right-click over report text or an existing selection, open a themed contextual menu.
   - Include actions such as:
     - “Go to reference”
     - “Suggest rewrite”
     - “Clarify this”
     - “Make more rigorous”
     - “Add caveat”
     - “Lasso select region”
   - The menu will match the Dexter theme rather than using the browser’s default menu.

4. Connect “Go to reference” to the literature/source area
   - Associate report sentences with the available mock papers/citations.
   - Clicking “Go to reference” will scroll/highlight the citation or open a small reference panel showing the relevant paper/source.
   - For now, this will be modeled from the existing mock literature data; later it can connect to real generated citations when the backend exists.

5. Add guided edit prompts for selected text
   - After choosing an edit action, show a small prompt box near the selection.
   - The selected passage will be quoted/contextualized, and the user can type a guided instruction like “make this more cautious” or “add comparison to trehalose literature.”
   - Since the app currently uses mock data, this will initially capture/display the requested edit rather than calling a real LLM.

6. Add a lasso selection mode
   - Add a “lasso select region” mode from the context menu.
   - While active, the cursor can drag over a rectangular/freeform region of the report.
   - Text intersecting that region will become part of a bulk selection, then the same guided prompt menu can be used for that region.

Technical details:

- Main changes will be in `src/routes/index.tsx` and `src/styles.css`.
- The current `PlanViewScreen`, `PlanCard`, and side list layout will be refactored into a document-style report component.
- I’ll add local React state for:
  - current selected text
  - selected paragraph/sentence IDs
  - context menu position
  - active reference highlight
  - active prompt/edit instruction
  - lasso mode and lasso bounds
- CSS will add:
  - paper/report typography
  - warm document background
  - custom text selection styling
  - squiggly underline annotation style
  - themed context menu and prompt popover
  - lasso overlay visuals

Expected result:

The report page will feel like a real generated scientific report instead of cards. Users will be able to select text, right-click for meaningful actions, jump to references, and create targeted edit prompts on individual sentences or larger lasso-selected regions.