# React Markdown Preview Libraries Research Report

**Date:** 2026-03-15 | **Task:** Find best React markdown preview component for GitHub-style rendering

---

## Executive Summary

**Recommended Solution: `react-markdown` + `remark-gfm` + `rehype-highlight`**

This combination provides the most flexible, secure, and battle-tested approach for GitHub-flavored markdown rendering in React 19. It's production-ready with 15,539 GitHub stars and 13.1M weekly npm downloads.

**Alternative (Lightweight):** `@uiw/react-markdown-preview` for a pre-styled, drop-in component with GitHub styling baked in.

---

## Top Candidates Analysis

### 1. **react-markdown** (RECOMMENDED)
**Status:** Production Ready | **Latest Version:** 10.0.0 (2025-02-20)

#### Package Details
- **NPM Package:** `react-markdown`
- **GitHub Stars:** 15,539
- **Weekly Downloads:** 13,117,471
- **Bundle Size:** 42.6 kB (minified + gzipped)
- **React Compatibility:** React 19 supported (fixed in v9.0.2 with declaration maps)
- **Last Update:** February 2025

#### Strengths
✅ **100% CommonMark + GFM Compliant:** Built on remark/rehype ecosystem
✅ **Syntax Highlighting:** Integrates with `rehype-highlight` (via highlight.js) or `react-syntax-highlighter`
✅ **Code Block Whitespace:** Preserves whitespace in `<pre>` tags correctly (known issue fixed in earlier PRs #577)
✅ **GFM Support:** Tables, strikethrough, task lists, footnotes via `remark-gfm` plugin
✅ **Security First:** No dangerouslySetInnerHTML by default; uses React's JSX escaping
✅ **Customizable:** Component overrides via `components` prop; plugin architecture via `remarkPlugins`/`rehypePlugins`
✅ **Mermaid Ready:** Can integrate `rehype-mermaid` plugin for diagram support
✅ **KaTeX Ready:** Can integrate `rehype-katex` + `remark-math` plugins
✅ **TypeScript Support:** Full type definitions

#### Weaknesses/Considerations
⚠️ **Larger Bundle:** 42.6 kB gzipped (not tiny, but reasonable for feature set)
⚠️ **Plugin Setup:** Requires adding plugins for GFM, syntax highlighting, mermaid, etc.
⚠️ **v10.0.0 Breaking Changes:** Removed `className` prop, `inline`/`level`/`checked`/`index` props; may require component override updates
⚠️ **Async Plugins:** Latest version (9.1.0) added async plugin support—ensure plugin compatibility

#### Code Block Handling
- **Whitespace Preservation:** ✅ YES - properly renders in `<pre>` tags
- **Syntax Highlighting:** ⚠️ Requires `rehype-highlight` or similar plugin
- **Language Detection:** ✅ YES - detects from fenced code block info string

#### Plugin Integration
```
Core dependencies for GitHub rendering:
- remark-gfm        → GFM support (tables, strikethrough, task lists)
- rehype-highlight  → Syntax highlighting for code blocks
- Optional: rehype-mermaid, rehype-katex, remark-math
```

---

### 2. **@uiw/react-markdown-preview**
**Status:** Production Ready | **Latest Version:** 5.1.5 (7 months ago)

#### Package Details
- **NPM Package:** `@uiw/react-markdown-preview`
- **GitHub Stars:** 336
- **Bundle Size:** Smaller than react-markdown (exact size not disclosed, but "minimal")
- **React Compatibility:** No explicit React 19 statement; uses modern rehype plugins
- **Last Update:** ~7 months ago (slightly less frequent updates)
- **Variants:** Standard (with `rehype-prism-plus`) and `/nohighlight` (bundle size optimization)

#### Strengths
✅ **GitHub Style Out-of-Box:** CSS already replicates GitHub markdown styling
✅ **Lighter Setup:** Single component, styles included; no extensive plugin configuration
✅ **GFM Support:** Tables, strikethrough, task lists, footnotes built-in
✅ **Syntax Highlighting:** Includes `rehype-prism-plus` by default (based on Prism)
✅ **Dark Mode Support:** Built-in dark mode / night mode capability
✅ **Code Block Whitespace:** ✅ YES - preserves whitespace correctly
✅ **Bundle Optimization:** `/nohighlight` variant available for bundle-conscious apps
✅ **KaTeX Support:** Can be integrated through custom renderers

#### Weaknesses/Considerations
⚠️ **Lower Adoption:** Only 336 GitHub stars vs react-markdown's 15K+
⚠️ **Slower Updates:** Last update ~7 months ago (vs react-markdown's active maintenance)
⚠️ **Less Flexible:** Opinionated GitHub styling; harder to customize if you need different look
⚠️ **Mermaid Support:** Not built-in; requires custom component integration
⚠️ **Prism-based:** Uses Prism for highlighting, not as popular as highlight.js
⚠️ **Security:** If using raw HTML, requires `rehype-sanitize` plugin

#### Code Block Handling
- **Whitespace Preservation:** ✅ YES
- **Syntax Highlighting:** ✅ YES (via rehype-prism-plus by default)
- **Language Detection:** ✅ YES

---

### 3. **Other Notable Options**

#### markdown-to-jsx
- **Status:** Lightweight alternative
- **Size:** Unknown exact bundle size
- **Use Case:** Simpler markdown without extensive plugin support
- **Verdict:** Not recommended for GFM + syntax highlighting requirements

#### MDXEditor
- **Bundle Size:** 851.1 kB gzipped (VERY LARGE)
- **Use Case:** Full WYSIWYG editing, not preview-only
- **Verdict:** Overkill for preview requirements; bloated for your use case

#### @mdx-js/react (MDX)
- **Use Case:** Markdown with embedded React components
- **Verdict:** Different paradigm (JSX in markdown); not for pure markdown preview

---

## Detailed Comparison Table

| Feature | react-markdown | @uiw/react-markdown-preview | Notes |
|---------|---|---|---|
| **GFM Support** | ✅ via plugin | ✅ built-in | react-markdown more modular |
| **Syntax Highlighting** | ⚠️ plugin required | ✅ built-in | @uiw simpler out-of-box |
| **Code Block Whitespace** | ✅ YES | ✅ YES | Both handle correctly |
| **Mermaid** | 🔧 plugin support | ✗ requires custom code | react-markdown better |
| **KaTeX/Math** | 🔧 plugin support | 🔧 custom integration | Both require setup |
| **Bundle Size (gzip)** | 42.6 kB | ~15-20 kB* | @uiw lighter; react-markdown feature-rich |
| **GitHub Stars** | 15,539 | 336 | react-markdown far more popular |
| **Last Update** | Feb 2025 | ~7 months ago | react-markdown more active |
| **React 19** | ✅ fixed | ⚠️ untested | react-markdown explicit support |
| **Customization** | ✅✅✅ | ⚠️ limited | react-markdown more flexible |
| **Security** | ✅ safe by default | ✅ safe by default | Both good |
| **TypeScript** | ✅ full support | ✅ full support | Both have types |
| **Setup Complexity** | ⚠️ moderate | ✅ simple | @uiw plug-and-play |

*Estimated for @uiw based on "minimal CSS" claim

---

## Syntax Highlighting Details

### react-markdown Approach
Supports multiple highlighting libraries via plugin swapping:
1. **rehype-highlight** (recommended) — uses highlight.js
   - Large grammar library, industry standard
   - Lighter than Prism for many use cases

2. **react-syntax-highlighter** — standalone approach
   - More granular control
   - Supports both Prism and highlight.js engines

### @uiw Approach
Uses **rehype-prism-plus** (Prism-based)
- Good grammar coverage
- Slightly larger bundle than highlight.js
- Version 2 recently updated

---

## Code Block Whitespace Handling

**Important Finding:** Whitespace preservation in code blocks requires:
1. Proper `<pre>` + `<code>` tag structure ✅ Both libraries handle this
2. No template literal indentation issues when defining markdown
3. CSS rule: `white-space: pre` or `pre-wrap` (GitHub uses `pre-wrap`)

**Both libraries preserve whitespace correctly.** Main issue is developer input formatting, not the libraries themselves.

---

## Mermaid & KaTeX Support

### Mermaid Diagrams

| Library | Support | Notes |
|---------|---------|-------|
| **react-markdown** | 🔧 Plugin: `rehype-mermaid` | Easy to add; works with plugin system |
| **@uiw** | ✗ Manual custom component | Possible but requires more code |

### KaTeX / Math

| Library | Support | Notes |
|---------|---------|-------|
| **react-markdown** | 🔧 Plugins: `remark-math` + `rehype-katex` | Standard unified pipeline approach |
| **@uiw** | 🔧 Custom renderer component | Can override code block renderer for math |

**Winner for both:** react-markdown has better ecosystem support via plugins.

---

## Whitespace in Table Elements (Gotcha)

Both libraries had/have issues with whitespace in table cells in earlier versions:
- **react-markdown:** Fixed in PR #577 (filters whitespace from table cells)
- **@uiw:** Built-in handling via rehype pipeline

**Status:** ✅ Fixed in current versions. GFM tables work fine in both.

---

## Security Considerations

### react-markdown
- ✅ Safe by default (no dangerouslySetInnerHTML)
- ✅ Uses React's JSX escaping
- ⚠️ If using `rehype-raw` for HTML, **must also use `rehype-sanitize`**
- Recommendation: Use `rehype-sanitize` if content is user-generated

### @uiw
- ✅ Safe by default
- ⚠️ If using HTML features, **must use `rehype-sanitize`**
- Recommendation: Same as react-markdown

---

## Recommendation Decision Tree

```
┌─ Do you need Mermaid + Math support?
│  ├─ YES → use react-markdown (better plugin ecosystem)
│  └─ NO ──┐
│          ├─ Do you want minimal setup + pre-styled GitHub look?
│          │  ├─ YES → use @uiw/react-markdown-preview (drop-in)
│          │  └─ NO → use react-markdown (more flexible)
│          │
│          └─ Bundle size critical (mobile app)?
│             ├─ YES → @uiw/react-markdown-preview or react-markdown + tree-shake
│             └─ NO → react-markdown (feature-rich default choice)
```

### Final Recommendation

**PRIMARY:** `react-markdown` + `remark-gfm` + `rehype-highlight`
- **Why:** Production-proven, active maintenance, React 19 support, extensible plugin system, best ecosystem for future needs (mermaid, math, custom renderers)
- **Setup:** Moderate (3-4 plugins to configure)
- **Use if:** You want GitHub-style markdown with room to grow, custom styling, or need advanced features

**ALTERNATIVE:** `@uiw/react-markdown-preview`
- **Why:** GitHub styling built-in, simpler setup, good enough for standard use cases
- **Setup:** Minimal (import, use)
- **Use if:** You want GitHub markdown "just works," don't need mermaid/math, and prefer simplicity

---

## Implementation Checklist

### For react-markdown
```
1. Install: npm install react-markdown remark-gfm rehype-highlight
2. Add syntax highlighting CSS (highlight.js theme)
3. Configure component with remarkPlugins and rehypePlugins
4. Optional: Add rehype-mermaid, remark-math, rehype-katex
5. Test: GFM tables, strikethrough, code blocks, syntax highlighting
```

### For @uiw
```
1. Install: npm install @uiw/react-markdown-preview
2. Import CSS stylesheet
3. Use component directly with markdown string
4. Test: GFM tables, strikethrough, code blocks, dark mode
```

---

## GitHub References & Sources

Key authoritative sources for further details:
- [react-markdown GitHub](https://github.com/remarkjs/react-markdown)
- [react-markdown NPM](https://www.npmjs.com/package/react-markdown)
- [@uiw/react-markdown-preview GitHub](https://github.com/uiwjs/react-markdown-preview)
- [remark-gfm Plugin](https://github.com/remarkjs/remark-gfm)
- [rehype-highlight Plugin](https://github.com/rehypejs/rehype-highlight)
- [Bundlephobia: react-markdown](https://bundlephobia.com/package/react-markdown)

---

## Unresolved Questions

1. **React 19 status for @uiw:** Needs explicit test/confirmation with React 19 peer dependencies
2. **Exact bundle size of @uiw:** Approximate only; need to measure in actual project
3. **Prism vs highlight.js performance:** No benchmarks provided in research; choose based on grammar requirements
4. **Custom mermaid styling:** How deep can you customize mermaid rendering in react-markdown plugin?
5. **Async plugins impact:** How does async plugin support (v9.1.0+) affect React rendering performance?
