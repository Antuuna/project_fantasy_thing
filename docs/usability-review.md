# Local MVP usability review

Reviewed 2026-10-12 against the local production Next.js server and local Supabase.
This document records rendered inspection and browser assertions; it does not claim hosted release verification.

## Reproduction and tested behavior

```sh
E2E_PRODUCTION=1 npx playwright test tests/usability/usability.spec.ts tests/lineups/lineups.spec.ts
```

The combined run passed **8 tests**: six lineup workflows and two usability workflows, with zero retries or skips. The coordinator subsequently ran the complete production suite with the normal local confirmation-disabled configuration: **26 tests passed**, with zero retries or skips; that final run regenerated the screenshots inspected below. Each usability workflow uses a unique temporary account and cleans it up in `finally`. The populated workflow creates six roster members and a full saved lineup through authenticated RPCs, plus watchlist notes through the authenticated client. Shared dataset reads remain bounded.

The usability checks cover a 1280×900 desktop viewport and a 375×812 narrow viewport. They assert no document-level horizontal overflow and labels for visible form controls. A genuine Tab interaction verifies a visible focus outline of at least two pixels; native select keyboard typeahead emits a real `change` event and updates the editor's dirty status. A synchronized hold on a genuine server-action request verifies the pending label and disabled rename input. A rejected whitespace-only rename leaves the previous name visible. Empty roster/watchlist states, missing import metadata, controlled account-specific database failure, and the working retry button are exercised.

## Defect found and regression coverage

Keyboard Enter exposed an automatic form-reset defect after a successful lineup action: all five native selects could display their blank options while React still represented the saved starters. The coordinator corrected the lineup form to prevent its automatic native reset. The lineup browser helper now checks all five selected values immediately after saving, before any reload. Those assertions passed throughout the six production lineup workflows.

Initial native-select End/Enter test recipes were diagnostic failures, not passing evidence. The final test uses genuine native keyboard typeahead and asserts the emitted change event, changed selected value, and dirty status. A separate transient production-build failure in the in-progress confirmation spec was resolved before the passing combined run.

## Rendered inspection

Full-page PNGs are generated under `/tmp` rather than committed to the repository. The following final-route screenshots have been opened and inspected:

| Artifact | Observed layout |
| --- | --- |
| `/tmp/fantasy-visual-dashboard-desktop.png` | Roster rows, date controls, saved starters/bench, editor, and historical appearances align without overlap. Saved snapshot/editor form two columns. The historical absence explanation does not invent a team. |
| `/tmp/fantasy-visual-dashboard-mobile.png` | The roster title wraps cleanly; rename/removal controls, date input, saved snapshot, editor, and historical games stack within the viewport. All five saved select values remain visible. |
| `/tmp/fantasy-visual-watchlist-mobile.png` | The player card, labelled wrapping notes textarea, character-limit hint, and stacked action buttons fit. Longer notes scroll within the editable textarea. |
| `/tmp/fantasy-visual-players-mobile.png` | Search input/button fit the viewport; names wrap inside rows; pagination stays visible. The table contains its horizontal scrolling. |
| `/tmp/fantasy-visual-details-mobile.png` | Player controls fit, averages form a readable two-column grid, and recent history stays inside its own horizontal scrolling region. |
| `/tmp/fantasy-visual-signin-mobile.png` | The card, labelled inputs, submit button, and account links fit without clipping. The screenshot contains no entered credentials. |
| `/tmp/fantasy-visual-error-mobile.png` | The failure heading, account-neutral explanation, and orange retry button remain readable and visible. |

All seven screenshots from the final production run were opened and inspected. Earlier dashboard-mobile/watchlist-mobile captures showed the streamed loading fallback rather than the final route; capture now explicitly waits for dashboard regions/watchlist heading and textarea, and for the loading fallback to disappear. The final artifacts show the completed pages.

## Review outcome and scope

No clipping or overlapping page content was found in the seven final-route screenshots. Wide directory/history tables scroll within their containers instead of widening the document. The coordinator added explicit swipe/scroll hints after the initial inspection; the regenerated screenshots show these hints beneath both tables. No unresolved functional usability defect was found within this review.

This review does not substitute for screen-reader, every-device, hosted authentication, or deployed-origin testing. Those claims require separate evidence.
