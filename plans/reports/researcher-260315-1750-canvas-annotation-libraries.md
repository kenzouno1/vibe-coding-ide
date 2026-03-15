# Canvas Annotation Libraries Research Report
**Date:** 2026-03-15 | **Project:** Tauri Desktop App Annotation Tool

---

## Executive Summary

For a Tauri desktop annotation tool, **Konva.js** and **Fabric.js** are production-ready. **tldraw** excels for rich whiteboard features but carries significant bundle overhead. **Excalidraw** offers embedded component model but less customization. **react-sketch-canvas** is lightweight but feature-limited for desktop use.

**Recommendation for Tauri:** Use **Konva.js** + **react-konva** for optimal balance of features, performance, bundle size, and React integration. Alternative: **Fabric.js** if SVG import/export is critical.

---

## Library Comparison Matrix

| Library | Bundle Size | React | Features | Maintenance | Desktop-Ready |
|---------|------------|-------|----------|-------------|--------------|
| **Konva.js** | 54.9 kB (gzip) | Excellent | ⭐⭐⭐⭐⭐ | Very Active | ✅ Yes |
| **Fabric.js** | ~100+ kB | Good | ⭐⭐⭐⭐ | Active | ✅ Yes |
| **tldraw** | ~500+ kB | Excellent | ⭐⭐⭐⭐⭐ | Very Active | ⚠️ Overkill |
| **Excalidraw** | ~400+ kB | Good | ⭐⭐⭐⭐ | Very Active | ⚠️ Embed-only |
| **Paper.js** | ~50 kB | Fair | ⭐⭐⭐ | Moderate | ✅ Yes |
| **react-sketch-canvas** | ~30 kB | Excellent | ⭐⭐ | Inactive | ⚠️ Limited |

---

## Detailed Evaluation

### 1. **Konva.js** ⭐ RECOMMENDED
**Bundle:** 54.9 kB minified+gzip
**React:** `react-konva` official bindings (excellent)
**Maintenance:** Very active, most downloaded 2D canvas framework on npm

**Strengths:**
- Smallest lightweight option among feature-complete libraries
- Official React bindings with declarative component API (`<Circle />`, `<Rect />`, etc.)
- Built-in drag-drop, event handling, animations, filters (blur, brighten, contrast, grayscale)
- High-performance layer/group nesting, efficient redraws
- TypeScript support out of the box
- MIT license, completely free

**Fit for Requirements:**
- ✅ Freehand drawing (via path tools)
- ✅ Shapes (rectangles, circles, arrows via plugins)
- ✅ Text labels (native `Text` node)
- ✅ Color picker (simple integration)
- ✅ Undo/redo (manage via state)
- ✅ Export annotated image (canvas.toImage(), getCanvas().toDataURL())
- ✅ Works on image backgrounds

**Tauri Integration:** Seamless. No Node.js dependency bloat.

---

### 2. **Fabric.js**
**Bundle:** ~100+ kB minified+gzip
**React:** Manual integration via useRef/useEffect (moderate friction)
**Maintenance:** Active, mature ecosystem

**Strengths:**
- Powerful SVG-to-canvas parser (rare)
- Canvas-to-SVG export (unique)
- Rich text editing native support (click-to-edit)
- Extensive shape library
- Long history, large community

**Weaknesses:**
- No first-class React bindings (requires useEffect+canvas setup)
- Heavier bundle (2x Konva)
- More complex API surface
- React integration is imperative, not declarative

**Fit for Requirements:** ✅ All met. Slightly better for SVG workflows.

**Use case:** If you need SVG import/export. Otherwise, Konva is lighter.

---

### 3. **tldraw**
**Bundle:** ~500+ kB (feature-rich, significant overhead)
**React:** Excellent integration, embedded as component
**Maintenance:** Very active, $10M Series A funded 2026

**Strengths:**
- Feature-complete infinite canvas (more than you need)
- Real-time collaboration built-in (@tldraw/sync + Cloudflare Durable Objects)
- AI integration, pressure-sensitive drawing, snapping
- Multiplayer out-of-the-box
- TypeScript-first

**Weaknesses:**
- **Bundle bloat for desktop app** (desktop should not have collaboration overhead)
- Overkill for simple screenshot annotation
- Slower startup on low-end machines
- Less granular feature control

**Verdict:** Over-engineered. Bundle size unsuitable for Tauri desktop. Better for web collaboration tools.

---

### 4. **Excalidraw**
**Bundle:** ~400+ kB
**React:** Embedded component (`@excalidraw/excalidraw` npm)
**Maintenance:** Very active, Jan 2026 integration guides published

**Strengths:**
- Embeds as React component (props + imperative API for control)
- Hand-drawn aesthetic
- Scene import/export
- Collaborative features available

**Weaknesses:**
- Heavy bundle for desktop
- Limited customization (component-model enforces UI patterns)
- Designed for whiteboard, not annotation overlay
- Requires React ecosystem

**Use case:** If visual style (hand-drawn) is requirement. Otherwise overkill.

---

### 5. **Paper.js**
**Bundle:** ~50 kB
**React:** No official bindings (manual integration)
**Maintenance:** Moderate, mature

**Strengths:**
- Lightweight vector graphics engine
- SVG-friendly
- No React dependency (can run standalone)

**Weaknesses:**
- No React integration story
- Limited UI/interaction tools (more low-level graphics)
- Smaller ecosystem for annotation-specific features

**Use case:** For pure vector graphics. Not ideal for annotation UX.

---

### 6. **react-sketch-canvas**
**Bundle:** ~30 kB
**React:** Excellent (native React component)
**Maintenance:** ⚠️ Appears inactive

**Strengths:**
- Lightest bundle
- Simple React integration
- SVG-based drawing

**Weaknesses:**
- **Unmaintained** (no recent updates)
- Feature-poor (freehand only, minimal shapes)
- No undo/redo built-in
- Not suitable for production annotation tool

**Verdict:** Avoid for production. Bundle size advantage negated by missing features.

---

## Other Honorable Mentions

- **Rough.js (~9 kB gzip):** Sketchy/hand-drawn style only. Requires composition.
- **Scrawl-canvas:** Responsive canvas, but niche.
- **oCanvas (~21 kB gzip):** Lightweight, but less modern API.

---

## Recommendation for Your Tauri App

### Primary Choice: **Konva.js + react-konva**

**Why:**
1. **Smallest bundle** among full-featured libraries (54.9 kB) — critical for desktop
2. **Native React support** — aligns with your stack
3. **All requirements met** — drawing, shapes, text, color, undo/redo, export
4. **High performance** — desktop doesn't need infinite canvas, Konva's layer system is efficient
5. **Active maintenance** — most popular 2D canvas framework on npm
6. **Zero bloat** — no collaboration, AI, or multiplayer cruft
7. **TypeScript ready** — type-safe

**Implementation Path:**
```bash
npm install konva react-konva
```

- Use `<Stage>`, `<Layer>`, `<Shape>` components for declarative canvas
- Implement custom annotation tools wrapper
- Export via `stage.toImage()` or `canvas.toDataURL()`
- Manage undo/redo via React state or Zustand

### Fallback: **Fabric.js**

Only if you have strong SVG import/export requirements. 2x bundle overhead.

### Avoid:
- ❌ **tldraw** — bundle too large for desktop, overcomplicated
- ❌ **Excalidraw** — embedded component limits customization
- ❌ **react-sketch-canvas** — unmaintained, too minimal

---

## Integration Checklist (Konva.js)

- [ ] Install: `npm install konva react-konva`
- [ ] Wrap editor in `<Stage>` component (canvas container)
- [ ] Create layer management (background image layer + annotation layer)
- [ ] Implement tool selector (pen, rect, circle, text, color picker)
- [ ] Add state management for undo/redo (React hooks or external store)
- [ ] Implement export: `stage.toImage()` → download or copy to clipboard
- [ ] Test Tauri file I/O for screenshot import
- [ ] Measure bundle: should remain <100 kB total (Konva + dependencies)

---

## Bundle Size Summary (Minified + Gzipped)

| Package | Size | Source |
|---------|------|--------|
| `konva` | 54.9 kB | [bestofjs.org/projects/konva](https://bestofjs.org/projects/konva) |
| `react-konva` | ~2 kB | Official wrapper (minimal) |
| `fabric` | ~100+ kB | Bundlephobia estimate |
| `@tldraw/tldraw` | ~500+ kB | [bundlephobia.com/@tldraw/tldraw](https://bundlephobia.com/package/@tldraw/tldraw) |
| `@excalidraw/excalidraw` | ~400+ kB | [bundlephobia.com/@excalidraw/excalidraw](https://bundlephobia.com/package/@excalidraw/excalidraw) |
| `react-sketch-canvas` | ~30 kB | npm estimate |

---

## Sources

- [Konva.js Documentation](https://konvajs.org/docs/react/index.html)
- [StackShare: Fabric.js vs Konva Comparison](https://stackshare.io/stackups/fabricjs-vs-konva)
- [Medium: Konva.js vs Fabric.js Technical Comparison](https://medium.com/@www.blog4j.com/konva-js-vs-fabric-js-in-depth-technical-comparison-and-use-case-analysis-9c247968dd0f)
- [BestOfJS: Konva Package Stats](https://bestofjs.org/projects/konva)
- [tldraw GitHub](https://github.com/tldraw/tldraw)
- [tldraw SDK 4.0 Announcement](https://tldraw.dev/blog/tldraw-sdk-4-0)
- [Excalidraw NPM Package](https://www.npmjs.com/package/@excalidraw/excalidraw)
- [Excalidraw Integration Docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)
- [Fabric.js Documentation](https://fabricjs.com/docs/)
- [Paper.js GitHub](https://github.com/paperjs/paper.js)
- [Tauri vs Electron 2026 Comparison](https://blog.nishikanta.in/tauri-vs-electron-the-complete-developers-guide-2026)
- [Electron vs Tauri: Bundle Size & Performance](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)

---

## Unresolved Questions

1. **Arrow tool in Konva:** Built-in? Or need custom path plugin? (Minor — standard shape composition solves)
2. **Highlighter transparency:** Does Konva support alpha blending for highlighter effect natively? (Yes via `opacity` prop)
3. **Pressure sensitivity:** Needed for pen input? (Not standard in browser canvas, requires Pointer Events API)
