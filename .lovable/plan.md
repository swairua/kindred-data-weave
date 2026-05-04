## Goal

Simplify the **Project** step (Step 3) of the Record-Test wizard to two controls only, and skip the rest of the wizard when the user picks an existing project.

## UX

```
Project
─────────────────────────────────────────
[ Select existing project          ▾ ]   ← dropdown
              — or —
[ +  Create new project              ]   ← button
```

- **Pick existing**: immediately load that project's metadata, skip steps 4 (Sample) and 5 (Record overview), and navigate straight to `/tests#<testKey>` — the same destination "Start recording" uses today. The selected project's data is loaded into `TestDataContext` for editing.
- **Click "Create new project"**: reveal the existing inline form (project name / client / date) and continue through Sample → Record as today.

## Changes — `src/pages/RecordTestWizard.tsx` only

1. **Replace the "list of project cards" UI** in step 2 with a shadcn `Select` (dropdown) populated from the already-loaded `projects`. Keep the "Create new project" button below the dropdown. Remove the empty-state card and the per-project card buttons.
2. **On dropdown change**:
   - Call `pickProject(id)` to populate state.
   - Call the existing `handleFinish()` flow directly (push metadata to `TestDataContext`, clear sessionStorage, toast, `navigate(/tests#testKey)`) — bypassing steps 3 and 4.
3. **"Create new project" button** keeps current behaviour: sets `creatingNewProject = true`, shows the inline form, and the user proceeds via the normal Next button through Sample and Record.
4. **Footer Next/Finish logic** unchanged for the "create new" path. For the "pick existing" path the user never sees the footer's Next button on this step — selection auto-advances and finishes.

No changes outside this file. No schema, context, or `/tests` page changes (the destination already loads project data from `TestDataContext`).
