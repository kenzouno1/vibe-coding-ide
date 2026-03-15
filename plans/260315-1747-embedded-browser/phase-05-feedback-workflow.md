# Phase 5: Feedback Workflow

## Context
- Plan: `plan.md`
- Depends on: Phase 4 (annotation canvas), Phase 3 (terminal integration)

## Overview
- **Priority**: P2
- **Status**: pending
- **Description**: Complete feedback loop — annotated screenshots + console errors packaged as structured feedback sent to terminal for Claude Code to consume

## Key Insights
- Claude Code can read images if given file path — save screenshot then send path
- Structured format (markdown) makes it easy for Claude Code to parse context
- Combine: URL + console errors + annotated screenshot + user notes into one feedback block

## Architecture

```
Annotation Overlay
├─ [Send Feedback] button
│
▼
Feedback Composer (modal/inline)
├─ Auto-filled: URL, console errors, screenshot path
├─ User input: notes/description
├─ Preview of structured feedback
├─ [Send to Terminal] → write_pty
│
▼
Terminal receives:
┌─────────────────────────────────────────┐
│ # Browser Feedback                      │
│ URL: http://localhost:3000/dashboard    │
│ Screenshot: .devtools/screenshots/xx.png│
│ Errors: 2 console errors               │
│ - TypeError: Cannot read 'x' of null   │
│ - Failed to fetch /api/users            │
│ Notes: Button alignment broken on hover │
└─────────────────────────────────────────┘
```

## Requirements

### Functional
- [ ] "Send Feedback" button in annotation toolbar
- [ ] Feedback composer: auto-populate URL, errors, screenshot path
- [ ] User can add notes/description text
- [ ] Preview formatted feedback before sending
- [ ] Send structured text to active terminal PTY
- [ ] Auto-save annotated screenshot before sending
- [ ] Quick feedback mode: send without annotation (just URL + errors + notes)

### Non-functional
- [ ] Feedback text <2KB (terminal-friendly)
- [ ] Screenshot saved with timestamp filename

## Related Code Files

### Files to Modify
- `src/components/annotation-overlay.tsx` — Add "Send Feedback" button
- `src/components/browser-console-panel.tsx` — Add "Quick Feedback" button
- `src/stores/browser-store.ts` — Add feedback composer state

### Files to Create
- `src/components/feedback-composer.tsx` — Feedback form modal

## Implementation Steps

### Step 1: Create feedback-composer.tsx
```tsx
interface FeedbackComposerProps {
  projectPath: string;
  screenshotPath?: string; // null if quick feedback
  onClose: () => void;
}

// Auto-populate from browser-store:
// - Current URL
// - Recent console errors (last 10)
// - Screenshot path (if from annotation)
// User adds: notes textarea

// Format output:
function formatFeedback(data: FeedbackData): string {
  let output = "# Browser Feedback\n";
  output += `URL: ${data.url}\n`;
  if (data.screenshotPath) {
    output += `Screenshot: ${data.screenshotPath}\n`;
  }
  if (data.errors.length > 0) {
    output += `Errors (${data.errors.length}):\n`;
    data.errors.forEach(e => output += `- ${e.message}\n`);
  }
  if (data.notes) {
    output += `Notes: ${data.notes}\n`;
  }
  return output;
}
```

### Step 2: Auto-save screenshot before feedback
When user clicks "Send Feedback" from annotation:
1. Export Konva stage → base64 PNG
2. Save to `.devtools/screenshots/feedback-{timestamp}.png`
3. Open feedback composer with screenshot path pre-filled

### Step 3: Send to terminal
```typescript
const sendFeedback = async (text: string) => {
  const activeSessionId = getActivePtySessionId(projectPath);
  if (activeSessionId) {
    // Send as a comment block so shell doesn't execute it
    const commented = text.split("\n").map(l => `# ${l}`).join("\n");
    await invoke("write_pty", { id: activeSessionId, data: commented + "\n" });
  }
};
```

### Step 4: Quick feedback from console panel
Add button in `browser-console-panel.tsx` toolbar:
- "Send Feedback" → opens feedback composer without screenshot
- Pre-fills current errors

## Todo List
- [ ] Create `feedback-composer.tsx` with form UI
- [ ] Add auto-save screenshot before feedback
- [ ] Format feedback as structured text
- [ ] Send to terminal as commented text
- [ ] Add "Send Feedback" to annotation toolbar
- [ ] Add "Quick Feedback" to console panel
- [ ] Test: full flow from screenshot → annotate → feedback → terminal

## Success Criteria
- Feedback composer shows URL, errors, screenshot path
- User can add notes
- Formatted text appears in terminal
- Screenshot saved to project directory
- Quick feedback (no screenshot) works from console panel

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Long feedback text wraps badly in terminal | Cap text length; format with short lines |
| Shell interprets feedback text | Prefix every line with `#` comment marker |
| Screenshot path not relative | Convert to relative path from project root |

## Next Steps
- Phase 6: Float layout + DevTools toggle
