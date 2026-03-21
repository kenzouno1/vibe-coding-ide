# Chat UI Panel Research Report
**Date:** 2026-03-21 | **Focus:** Desktop AI Chat UI Architecture for Tauri v2 + React

---

## Executive Summary

Modern AI chat UIs prioritize **streaming performance**, **semantic message rendering**, and **smart auto-scroll**. Key patterns:

1. **Streamdown** for progressive markdown without flash-of-incomplete-content
2. **React Virtuoso/TanStack Virtual** for 1000+ message performance
3. **useRef + Intersection Observer** for sticky-bottom auto-scroll
4. **Tool call rendering** via component-based pattern (shadcn/ui AI, assistant-ui)
5. **Zustand** state for pending/streaming/complete/error message states
6. **react-textarea-autosize** for composer with Shift+Enter newline support

DevTools is well-positioned: already using Zustand, Tailwind, Tauri v2, existing split-pane architecture.

---

## 1. Chat UI Component Architecture

### 1.1 Core Component Structure

**Recommended composition:**

```
ChatPanel
├── MessageList (virtualized)
│   ├── Message (streaming support)
│   │   ├── MarkdownRenderer (Streamdown)
│   │   ├── CodeBlock (Shiki syntax highlight)
│   │   └── ToolCallDisplay
│   ├── TypingIndicator
│   └── ScrollAnchor (for auto-scroll logic)
├── MessageComposer
│   ├── TextareaAutosize (with Shift+Enter)
│   ├── ToolSelector
│   └── SubmitButton
└── MessageStatusBar (pending, error indicators)
```

**Key insight:** Separate streaming message from completed messages in state—allows partial rendering without blocking user interaction.

### 1.2 Message List Virtualization

**Libraries:**
- **React Virtuoso** — Most mature for chat (variable heights, sticky headers, endless scroll)
- **TanStack Virtual** — Modern, flexible, ~10KB smaller
- **React Window** — Minimal overhead (6KB), good for fixed-height lists

**Why virtualize:**
- Chat with 500+ messages causes layout thrashing without virtualization
- Virtuoso auto-measures variable-height items (good for markdown diffs)
- Only visible items in DOM → 10-20x memory reduction vs 1000-message list

**Pattern:** Load 25-50 recent messages initially, fetch older on scroll-up.

### 1.3 Markdown Rendering with Streaming

**Problem:** Incomplete code blocks flash as raw text, bold markers appear visibly.

**Solution: Streamdown** (Vercel)
- Drop-in `react-markdown` replacement
- Renders unterminated blocks as styled (bold, code, headers) before completion
- Shiki syntax highlight with copy/download buttons
- Supports GFM, math, diagrams

**Implementation pattern:**
```tsx
// Instead of react-markdown
import { Streamdown } from '@vercel/streamdown'

<Streamdown>{streamingMarkdown}</Streamdown>
```

**Performance optimization (alternative approach):**
- Split markdown into blocks (use `marked` lib)
- React.memo each block independently
- Only re-render changed blocks
- ~10x faster for large responses

### 1.4 Code Block Rendering

**Requirements:**
- Syntax highlighting (Shiki)
- Copy button
- Language detection
- Download to file option (important for DevTools workflow)
- Line numbers (optional, disable for diffs)

**Integration:** Streamdown includes Shiki by default. For custom rendering:
```tsx
<CodeBlock
  language="typescript"
  code={code}
  onCopy={() => clipboardAPI}
  onDownload={() => tauriFileAPI}
/>
```

### 1.5 Tool Use / Action Visualization

**Pattern:** Render tool calls as inline components, not text.

**Example visualizations:**
```
🔧 Running: git diff main --stat
├─ a/src/index.ts (+45, -12)
├─ b/src/utils.ts (+8, -2)
└─ (2 files changed)

✓ Complete — [View full diff] [Apply changes]
```

**Implementation approach:**
- Define tool result types in TypeScript
- Map tool type → React component
- Render inline in message stream
- Show loading state → result → action buttons

**Libraries:**
- **shadcn/ui** — 25+ ready-made AI components + tool call UI
- **assistant-ui** — Tool call rendering, human approval flows
- **prompt-kit** — Structured outputs, code-friendly responses

---

## 2. Streaming UX Patterns

### 2.1 Typing / Thinking Indicators

**Pattern 1: Animated dots**
```tsx
<TypingIndicator />
// renders: ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏ (smooth rotation)
```

**Pattern 2: Pulsing text**
```tsx
const [pulse, setPulse] = useState(true)
useEffect(() => {
  const interval = setInterval(() => setPulse(!pulse), 500)
  return () => clearInterval(interval)
}, [])

<span className={pulse ? 'opacity-100' : 'opacity-50'}>
  Thinking...
</span>
```

**Best practice:**
- Show thinking indicator **inside** message before streaming starts
- Don't spawn a separate "AI is typing" message (reduces noise)
- Disappear once streaming begins (user sees actual response arriving)

### 2.2 Progressive Rendering

**Streaming flow:**
```
User submits → Message appears with status: "pending"
                ↓
            Thinking indicator shown
                ↓
            Stream starts → status: "streaming", content appends
                ↓
            Stream ends → status: "complete", remove indicator
```

**React pattern (with Zustand):**
```tsx
// Store: track message state
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'pending' | 'streaming' | 'complete' | 'error'
  toolCalls?: ToolCall[]
}

// Component: handle streaming
useEffect(() => {
  const stream = fetchStream(...)
  for await (const chunk of stream) {
    setMessages(m =>
      m.map(msg => msg.id === latestId
        ? { ...msg, content: msg.content + chunk }
        : msg
      )
    )
  }
}, [])
```

### 2.3 Handling Incomplete Markdown

**What breaks without Streamdown:**
- User sees `**bold` render as raw text
- Code fence without closing ` ``` ` doesn't style as code
- Lists cut mid-item look broken

**Streamdown approach:**
- Parse partial markdown incrementally
- Apply CSS classes even for unclosed blocks
- When new content arrives, re-parse entire message (fast with memoization)

**Fallback without Streamdown:**
- Use DOMParser to validate markdown before render
- If invalid, wrap in `<pre>` and syntax-highlight as raw text
- Risks: harder to get right, slower

---

## 3. React Component Patterns

### 3.1 Virtualized Message Lists

**Virtuoso setup:**
```tsx
import { Virtuoso } from 'react-virtuoso'

<Virtuoso
  style={{ height: '100%' }}
  data={messages}
  itemContent={(idx, message) => <Message key={message.id} {...message} />}
  followOutput={() => 'smooth' // auto-scroll only if already at bottom
}
  overscan={100} // buffer for smooth scrolling
/>
```

**Key configs:**
- `followOutput` — Don't snap if user scrolled up (they might be reading)
- `overscan` — Render 100px above/below viewport (smooth experience)
- `variable size` — Virtuoso measures each message height (good for mixed content)

### 3.2 Auto-Scroll with Smart Sticky-Bottom

**Problem:** User scrolls up to read message 5, then message 15 arrives. Should NOT jump to bottom.

**Solution: Intersection Observer**
```tsx
const bottomRef = useRef<HTMLDivElement>(null)
const [isAtBottom, setIsAtBottom] = useState(true)

useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    setIsAtBottom(entry.isIntersecting)
  })
  if (bottomRef.current) observer.observe(bottomRef.current)
  return () => observer.disconnect()
}, [])

// Only auto-scroll if user is at bottom
useEffect(() => {
  if (isAtBottom && bottomRef.current) {
    bottomRef.current.scrollIntoView({ behavior: 'smooth' })
  }
}, [messages.length, isAtBottom])

return (
  <>
    <MessageList />
    <div ref={bottomRef} />
  </>
)
```

**Why Intersection Observer over scrollTop checking:**
- No scroll event listener thrashing
- Built-in debouncing by browser
- More precise "user at bottom" detection

### 3.3 Message State Management

**Zustand store pattern:**
```tsx
interface ChatStore {
  messages: Message[]
  addMessage: (msg: Message) => void
  updateMessage: (id: string, partial: Partial<Message>) => void
  setMessageStatus: (id: string, status: Message['status']) => void
}

const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, partial) => set(s => ({
    messages: s.messages.map(m => m.id === id ? { ...m, ...partial } : m)
  })),
  setMessageStatus: (id, status) => set(s => ({
    messages: s.messages.map(m => m.id === id ? { ...m, status } : m)
  }))
}))
```

**Message states:**
- `pending` — User clicked send, waiting for backend
- `streaming` — Response arriving chunk-by-chunk
- `complete` — All content received, no more updates
- `error` — Request failed, show retry button

**UI mapping:**
```tsx
{message.status === 'pending' && <Skeleton />}
{message.status === 'streaming' && <TypingIndicator />}
{message.status === 'error' && <ErrorBanner onRetry={...} />}
{message.status === 'complete' && <Content />}
```

### 3.4 Composer Component (Input)

**Pattern: Auto-growing textarea with Shift+Enter support**

**Use `react-textarea-autosize`:**
```tsx
import TextareaAutosize from 'react-textarea-autosize'

<TextareaAutosize
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }}
  placeholder="Ask me anything..."
  minRows={1}
  maxRows={5}
  className="p-2 border rounded resize-none"
/>
```

**Alternative custom approach (CSS trick):**
- Hidden div mirrors textarea content
- Both same font size, padding, width
- Set textarea height to div's height
- No extra library, ~50 lines of code

**File attachment UX (future):**
- Drag-drop zone around textarea
- Cmd+V to paste files
- Show file chips above input with remove buttons
- Send as multipart with message

---

## 4. Tauri v2 + xterm.js Integration

### 4.1 Chat Panel + Terminal Side-by-Side

**Current DevTools architecture:** Split pane with terminal.

**Chat panel UX considerations:**

**Layout strategy (from Cursor/VSCode research):**
- **Right sidebar layout (VSCode Copilot):** Chat on right, editor/terminal on left
  - Pros: Always visible, persistent context
  - Cons: Reduces editor width on small screens

- **Bottom panel layout (Cursor alternative):** Chat stacks with terminal below editor
  - Pros: Preserves horizontal editor space
  - Cons: Requires vertical space, harder to multi-task

**DevTools recommendation:** Right sidebar (least disruption to existing splits)

### 4.2 Terminal-to-Chat Workflow

**Integration patterns:**

**Pattern 1: Copy output to chat**
- Right-click terminal output → "Send to chat"
- Prepends `\`\`\`bash\n` + output + `\`\`\``
- User can ask AI to explain/fix

**Pattern 2: Chat actions → Terminal**
- Tool call for `run_command("npm test")`
- Executes in Rust backend via `portable-pty`
- Returns stdout/stderr to chat
- User sees command execution inline

**Pattern 3: File sync**
- Chat suggests file changes
- User clicks "Apply" → Tauri writes file
- File watcher notifies editor
- Result: live feedback loop

### 4.3 Tauri Command Integration

**Rust backend (lib.rs pattern):**
```rust
#[tauri::command]
async fn stream_chat(prompt: String) -> Result<String, String> {
  // Call AI API, return response
  // Frontend receives in chunks via Tauri event listener
}

#[tauri::command]
async fn apply_file_edit(path: String, content: String) -> Result<(), String> {
  // Write file, return status
  // Emit event when done
}
```

**Frontend listener:**
```tsx
import { listen } from '@tauri-apps/api/event'

useEffect(() => {
  const unlisten = listen('chat-stream', (event: Event<string>) => {
    // Append chunk to message
    updateMessage(messageId, { content: prev => prev + event.payload })
  })
  return () => unlisten.then(f => f())
}, [])
```

### 4.4 Panel Type Selection UX

**Current DevTools views:** Terminal, Git, Editor, Browser.

**Adding Chat view:**
- New sidebar icon + tab
- Tab bar shows when active
- Settings: remember last active view
- Keyboard shortcut: Cmd+Shift+L (unused)

**Minimize/maximize chat panel:**
- Double-click title bar = collapse to icon
- Drag handle between chat/terminal to resize
- Right-click tab → detach to floating window (future)

---

## 5. Implementation Roadmap (YAGNI)

### Phase 1: Core Chat UI (Week 1)
- [ ] Message store (Zustand)
- [ ] Message list component (basic, no virtualization)
- [ ] Composer (textarea + send button)
- [ ] Markdown renderer (react-markdown initially, upgrade to Streamdown later)
- [ ] Basic typing indicator

### Phase 2: Streaming & Polish (Week 2)
- [ ] Upgrade to Streamdown for streaming markdown
- [ ] Implement Virtuoso virtualization
- [ ] Add Intersection Observer auto-scroll
- [ ] Tool call display component (basic)
- [ ] Error handling & retry UI

### Phase 3: Tauri Integration (Week 3)
- [ ] Backend command for AI streaming
- [ ] Terminal output → chat copy action
- [ ] File apply action (tool call → Tauri write)
- [ ] Message persistence (localStorage)

### Phase 4: Polish & Optimization (Week 4)
- [ ] Syntax highlighting (Shiki via Streamdown)
- [ ] Code block copy/download buttons
- [ ] Performance audit (virtualization confirm)
- [ ] Accessibility (ARIA, keyboard nav)
- [ ] Dark mode theme (Catppuccin already applied elsewhere)

---

## 6. Key Dependencies & Versions

**React chat ecosystem (Jan 2026 status):**

| Package | Purpose | Size | Recommendation |
|---------|---------|------|-----------------|
| `react-virtuoso` | Message virtualization | ~35KB | Use if 500+ msgs expected |
| `@vercel/streamdown` | Streaming markdown | ~15KB | Critical for UX |
| `react-textarea-autosize` | Composer input | ~1.3KB | Standard pattern |
| `shadcn/ui` (AI components) | Tool rendering | Variable | Import only needed components |
| `zustand` | State (already used) | ~2KB | ✓ Already in project |
| `tailwind` | Styling (already used) | Built-in | ✓ Already configured |

**No heavy dependencies:** All recommendations avoid Redux, complex state machines, or bloat.

---

## 7. Common Pitfalls to Avoid

| Pitfall | Why Bad | Fix |
|---------|---------|-----|
| Scroll to bottom on every message | Breaks when user reads history | Use Intersection Observer + isAtBottom state |
| Re-render entire message list on update | Causes janky typing | Use Virtuoso or key-based memoization |
| Parse markdown for streaming text | Flashes incomplete syntax | Use Streamdown or CSS-based incomplete-block styling |
| Store full chat in `useState` | Loses on refresh, memory bloat | Persist to localStorage, export to JSON |
| No tool call state tracking | UI doesn't show what AI is doing | Track status: pending → executing → complete |
| Textarea fixed height | Breaks UX with long prompts | Always use autosize |

---

## 8. DevTools-Specific Considerations

**Existing architecture:**
- Zustand already in use (good for chat state)
- Tailwind v4 + Catppuccin theme ready
- Split pane system existing (can extend for chat)
- xterm.js running in terminal pane
- Tauri v2 backend ready for commands

**Integration points:**
- Chat panel as new sidebar tab (like Git, Terminal, Editor)
- Share color palette with existing UI
- Reuse split-pane-container for chat↔terminal resize
- Leverage existing Tauri command pattern for streaming

**Breaking changes:** None. Chat panel is additive.

---

## 9. Success Metrics

- **UX:** 60 FPS with 500+ message list, <100ms keystroke→render on composer
- **Streaming:** Visible text appears within 100ms of token arrival (Streamdown handles)
- **Auto-scroll:** Never jumps if user is reading history (Intersection Observer)
- **Memory:** <50MB for typical chat session (Virtuoso limits DOM to ~50 items)
- **Code quality:** Message store fully typed, no `any`, <200 lines per component

---

## 10. Unresolved Questions

1. **AI backend:** Which model/API? (Claude via Anthropic SDK, local via Ollama, cloud via Groq?)
   - Impacts streaming protocol, token limits, cost
   - Recommend: Anthropic SDK (best streaming support, 200K context window)

2. **Message persistence:** SQLite backend vs localStorage?
   - localStorage simple but ~5MB limit per origin
   - SQLite (Tauri plugin) required for multi-session history
   - Current DevTools doesn't have DB—recommend localStorage phase 1

3. **Tool execution:** Should chat run commands in running terminal or spawn new?
   - Running terminal = simpler UX, risk of conflict
   - New pty = isolated execution, complex plumbing
   - Recommend: Separate pty, let user select output destination

4. **Context window:** Which files should chat see?
   - Editor's open tabs only = simple, limited context
   - Entire project = complex file watching, indexing
   - Recommend: Open tabs + workspace root path for git context

5. **Auth:** Multi-user support or single-user desktop app?
   - Desktop = single user, no auth needed
   - Current DevTools = single user
   - Recommend: API key in `.env.local` (Tauri can load via command)

---

## Sources

Research compiled from 12+ authoritative sources on React chat UIs, streaming patterns, and desktop app architecture:

- [I Evaluated Every AI Chat UI Library in 2026](https://dev.to/alexander_lukashov/i-evaluated-every-ai-chat-ui-library-in-2026-heres-what-i-found-and-what-i-built-4p10)
- [React Chat Messaging Docs - Stream](https://getstream.io/chat/docs/sdk/react/components/message-components/ui-components/)
- [VSCode Copilot Chat Docs](https://code.visualstudio.com/docs/copilot/chat/copilot-chat)
- [Virtualization in React: Improving Performance](https://medium.com/@ignatovich.dm/virtualization-in-react-improving-performance-for-large-lists-3df0800022ef)
- [React Virtuoso Docs](https://virtuoso.dev/)
- [Streamdown: Markdown Rendering for AI Streaming](https://github.com/vercel/streamdown)
- [Preventing Flash of Incomplete Markdown](https://news.ycombinator.com/item?id=44182941)
- [Automatic Scrolling for Chat in React](https://dev.to/deepcodes/automatic-scrolling-for-chat-app-in-1-line-of-code-react-hook-3lm1)
- [React Textarea Autosize](https://www.npmjs.com/package/react-textarea-autosize)
- [React Stream Chat - SDK State Management](https://getstream.io/chat/docs/sdk/react/guides/sdk-state-management/)
- [Tauri v2 Architecture & Templates](https://v2.tauri.app/)
- [React Components for Conversational AI - shadcn/ui](https://www.shadcn.io/ai)
