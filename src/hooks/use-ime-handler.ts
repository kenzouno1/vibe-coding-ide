/**
 * IME composition handler for xterm.js terminal.
 *
 * Two-layer approach:
 * 1. Native Rust layer (ime_handler.rs): Hooks Windows IME via IMM32 API,
 *    intercepts WM_IME_COMPOSITION, emits "ime-composed" events with final text.
 *    This makes EVKey/UniKey switch to composition mode (like WezTerm).
 *
 * 2. Browser layer (this file): Listens for compositionstart/compositionend
 *    on xterm's textarea as a fallback for IMEs that use browser composition API.
 *
 * Both layers suppress xterm's raw key processing during composition and
 * send the final composed text directly to PTY.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface ImeComposedPayload {
  text: string;
}

/** Setup IME composition handling on an xterm.js terminal container */
export function setupImeHandler(
  container: HTMLElement,
  write: (data: string) => void
) {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
  const state = { composing: false };
  const cleanups: (() => void)[] = [];

  // --- Layer 1: Native IME events from Rust (Windows IMM32) ---
  let nativeUnlisten: UnlistenFn | null = null;
  listen<ImeComposedPayload>("ime-composed", (event) => {
    if (event.payload.text) {
      write(event.payload.text);
    }
  }).then((unlisten) => {
    nativeUnlisten = unlisten;
  });
  cleanups.push(() => nativeUnlisten?.());

  // --- Layer 2: Browser composition events (fallback) ---
  if (textarea) {
    const onCompositionStart = () => {
      state.composing = true;
    };

    const onCompositionEnd = (e: CompositionEvent) => {
      state.composing = false;
      if (e.data) {
        write(e.data);
      }
      textarea.value = "";
    };

    // Block xterm's input processing during composition
    const onBeforeInput = (e: InputEvent) => {
      if (state.composing) {
        e.stopImmediatePropagation();
      }
    };

    const onInput = (e: Event) => {
      if (state.composing) {
        e.stopImmediatePropagation();
      }
    };

    textarea.addEventListener("compositionstart", onCompositionStart);
    textarea.addEventListener("compositionend", onCompositionEnd);
    textarea.addEventListener("beforeinput", onBeforeInput, { capture: true });
    textarea.addEventListener("input", onInput, { capture: true });

    cleanups.push(() => {
      textarea.removeEventListener("compositionstart", onCompositionStart);
      textarea.removeEventListener("compositionend", onCompositionEnd);
      textarea.removeEventListener("beforeinput", onBeforeInput, { capture: true } as EventListenerOptions);
      textarea.removeEventListener("input", onInput, { capture: true } as EventListenerOptions);
    });
  }

  return {
    state,
    cleanup: () => cleanups.forEach((fn) => fn()),
  };
}
