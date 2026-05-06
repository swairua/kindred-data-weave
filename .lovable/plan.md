## Scope
Project step (step 2) of `src/pages/RecordTestWizard.tsx` only.

## Current behavior
Picking an existing project from the dropdown skips the "details card" (project name / client / date) and jumps to step 3 (Sample setup). Only the "Create new project" path shows the editable details card.

## Fix
Make the editable details card appear in **both** flows on the Project step, prepopulated:

1. In `pickProject(id)` (around line 291):
   - Stop calling `setStep(3)`.
   - Set `creatingNewProject` to `true` so the same details card renders.
   - Populate `projectName`, `clientName`, `projectDate` from the selected row immediately.
   - Keep the existing background `fetchFullProject` call, but also push the loaded values back into `state` so the inputs stay in sync once the full record returns.

2. In the details card UI (around line 492):
   - Change the heading from a hardcoded "New project details" to dynamic: "Project details" when editing an existing one (`state.projectId` is set), "New project details" otherwise.
   - Change the "Cancel" button: when an existing project is loaded, it should clear the selection (`projectId = null`, blank fields) and return to the dropdown view; for a new project keep current behavior.

3. Leave step 3 (Sample setup) and onward untouched. The user advances with the regular "Next" footer button after reviewing/editing details.

## Files touched
- `src/pages/RecordTestWizard.tsx` (only the `pickProject` function and the step-2 details card markup).
