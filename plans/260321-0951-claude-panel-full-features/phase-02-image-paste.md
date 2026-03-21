# Phase 2: Image Paste & File Attachment

## Context
- [Claude CLI research](../../plans/reports/researcher-260321-claude-cli-subprocess-research.md) — `--input-files` flag
- [claude-input.tsx](../../src/components/claude-input.tsx)
- [claude_manager.rs](../../src-tauri/src/claude_manager.rs)

## Overview
- **Priority:** High
- **Status:** Pending
- Support clipboard paste (Ctrl+V images), drag-drop files, and file picker for sending to Claude

## Key Insights
- **No `--input-files` flag exists** in Claude CLI
- Two approaches for image input in `-p` mode:
  1. **Temp file approach (simpler):** Write image to temp file, include path in message text — Claude's `Read` tool handles images natively (PNG, JPEG, GIF, WebP, PDF)
  2. **NDJSON stdin approach (advanced):** Pipe `SDKUserMessage` with base64 image content block via `--input-format stream-json`
- Recommend approach 1 for simplicity
- Tauri can save clipboard bytes to temp dir via Rust command

## Requirements

### Functional
- Ctrl+V in input area detects image in clipboard, shows preview chip
- Drag-drop files onto chat panel adds them as attachments
- File picker button next to send button
- Preview chips show filename/thumbnail with remove button
- Attachments sent via `--input-files` flag on next message
- Multiple attachments supported

### Non-functional
- Image preview thumbnails < 64x64px (performance)
- Temp files cleaned up after message sent
- Max file size: 20MB per file (Claude CLI limit)

## Architecture

```
Clipboard paste / Drag-drop / File picker
  ↓
Frontend extracts file data (ArrayBuffer)
  ↓
Invoke Tauri command: claude_save_temp_file(bytes, filename)
  ↓
Rust saves to OS temp dir, returns absolute path
  ↓
Frontend stores path in attachments[] state
  ↓
On send: prepend "Please analyze the image at <path>" to message text
  (Claude's Read tool can natively read image files)
  ↓
After send: clean up temp files via Tauri command
```

NOTE: No `--input-files` flag exists. Instead, we include the file path in the message text and rely on Claude's `Read` tool to read/analyze image files natively.

## Related Code Files

### Modify
- `src/components/claude-input.tsx` — Add paste handler, drag-drop, file button, attachment chips
- `src/components/claude-chat-pane.tsx` — Wire attachment state
- `src/stores/claude-store.ts` — Add `attachments` to pane state, pass to sendMessage
- `src-tauri/src/claude_manager.rs` — Add `--input-files` args, add temp file commands

### Create
- `src/components/claude-attachment-chips.tsx` — Attachment preview chips with remove

## Implementation Steps

1. **Backend: temp file management** (`claude_manager.rs`)
   - Add `claude_save_temp_file(filename: String, data: Vec<u8>) -> String` command
     - Saves to `std::env::temp_dir()/devtools-claude/` with unique prefix
     - Returns absolute path
   - Add `claude_cleanup_temp_files(paths: Vec<String>)` command
   - No CLI flag changes needed — image path included in message text

2. **Store: attachment state** (`claude-store.ts`)
   - Add `attachments: string[]` (temp file paths) to `ClaudePaneState`
   - Add `addAttachment(paneId, path)` and `removeAttachment(paneId, path)` actions
   - Update `sendMessage` to pass `inputFiles` to Tauri command
   - Clear attachments after send + invoke cleanup

3. **Frontend: paste handler** (`claude-input.tsx`)
   - `onPaste` handler on textarea
   - Check `e.clipboardData.files` for images
   - Read as ArrayBuffer, invoke `claude_save_temp_file`
   - Add returned path to attachments

4. **Frontend: drag-drop** (`claude-chat-pane.tsx` or `claude-input.tsx`)
   - `onDragOver`/`onDrop` handlers on chat panel
   - Same flow: save temp file, add to attachments

5. **Frontend: file picker button**
   - Use `@tauri-apps/plugin-dialog` `open()` for file selection
   - Filter: images, PDFs, text files
   - Add selected file path directly (no need for temp copy)

6. **Frontend: attachment chips** (`claude-attachment-chips.tsx`)
   - Show filename (truncated) + file type icon
   - Image files: show small thumbnail via `convertFileSrc()`
   - X button to remove
   - Render between input textarea and send button area

## Todo List
- [ ] Add temp file Tauri commands in Rust
- [ ] Update claude_send_message to accept input_files
- [ ] Add attachment state to claude-store
- [ ] Implement paste handler
- [ ] Implement drag-drop handler
- [ ] Add file picker button
- [ ] Create attachment chips component
- [ ] Test with PNG, JPEG, PDF files

## Success Criteria
- Ctrl+V image from clipboard shows preview chip
- Drag-drop file onto panel shows chip
- File picker opens native dialog and adds file
- Message sent with attachments includes `--input-files`
- Temp files cleaned up after send
- Remove button on chips works

## Risk Assessment
- **Medium risk:** Clipboard API varies across OS — test on Windows specifically
- **Tauri permission:** May need `fs` plugin permissions for temp file access
- **Large files:** Need to handle 20MB+ gracefully (show error, don't crash)

## Security Considerations
- Temp files stored in OS temp dir with random prefix
- Files cleaned up immediately after send
- No path traversal possible (Rust generates paths)
