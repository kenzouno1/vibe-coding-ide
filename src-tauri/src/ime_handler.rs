//! Native Windows IME handler for Vietnamese input (EVKey/UniKey/Windows Telex).
//!
//! Vietnamese IMEs use "backspace-replace" in apps that don't handle IME properly.
//! By hooking the window procedure and handling WM_IME_* messages, the IME switches
//! to composition mode — similar to how WezTerm handles this.
//!
//! Flow: WM_IME_COMPOSITION → ImmGetCompositionString → emit event → frontend → PTY

#[cfg(windows)]
mod platform {
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Input::Ime::{
        ImmGetCompositionStringW, ImmGetContext, ImmReleaseContext, GCS_RESULTSTR,
    };
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, WM_IME_COMPOSITION, WM_IME_ENDCOMPOSITION, WM_IME_STARTCOMPOSITION,
    };

    /// Global app handle for emitting events from the subclass callback.
    /// Safe because IME messages arrive on the UI thread (single-threaded).
    static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

    /// Payload emitted to frontend when IME composition completes
    #[derive(serde::Serialize, Clone)]
    pub struct ImeComposedText {
        pub text: String,
    }

    /// Extract the final composed string from an IME context
    fn get_composition_result(hwnd: HWND) -> Option<String> {
        unsafe {
            let himc = ImmGetContext(hwnd);
            if himc.is_invalid() {
                return None;
            }

            // First call: get required buffer size (in bytes)
            let size = ImmGetCompositionStringW(himc, GCS_RESULTSTR, None, 0);
            if size <= 0 {
                let _ = ImmReleaseContext(hwnd, himc);
                return None;
            }

            // Second call: fill buffer with UTF-16 data
            let len = (size as usize) / 2;
            let mut buffer = vec![0u16; len];
            let result = ImmGetCompositionStringW(
                himc,
                GCS_RESULTSTR,
                Some(buffer.as_mut_ptr() as *mut _),
                size as u32,
            );
            let _ = ImmReleaseContext(hwnd, himc);

            if result <= 0 {
                return None;
            }

            String::from_utf16(&buffer).ok()
        }
    }

    /// Window subclass procedure that intercepts IME messages
    unsafe extern "system" fn ime_subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _uid_subclass: usize,
        _ref_data: usize,
    ) -> LRESULT {
        match msg {
            WM_IME_STARTCOMPOSITION => {
                // Let default processing show the composition window
                return DefSubclassProc(hwnd, msg, wparam, lparam);
            }
            WM_IME_COMPOSITION => {
                // Check if the message contains a final result string
                if (lparam.0 as u32) & GCS_RESULTSTR.0 != 0 {
                    if let Some(text) = get_composition_result(hwnd) {
                        if let Some(app) = APP_HANDLE.get() {
                            let _ = app.emit("ime-composed", ImeComposedText { text });
                        }
                    }
                }
                // Let default processing handle the rest (preedit display, etc.)
                return DefSubclassProc(hwnd, msg, wparam, lparam);
            }
            WM_IME_ENDCOMPOSITION => {
                return DefSubclassProc(hwnd, msg, wparam, lparam);
            }
            _ => {}
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    /// Callback for EnumChildWindows — subclass each child window
    unsafe extern "system" fn enum_child_callback(
        hwnd: HWND,
        _lparam: LPARAM,
    ) -> windows::Win32::Foundation::BOOL {
        let _ = SetWindowSubclass(hwnd, Some(ime_subclass_proc), 1, 0);
        true.into()
    }

    /// Install IME handler on the Tauri window and all child windows (WebView2)
    pub fn install_ime_handler(app: &AppHandle, window: &tauri::WebviewWindow) {
        APP_HANDLE.set(app.clone()).ok();

        // Get the native HWND
        let raw_hwnd = match window.hwnd() {
            Ok(hwnd) => hwnd.0 as isize,
            Err(e) => {
                log::warn!("Could not get HWND for IME handler: {e}");
                return;
            }
        };
        let hwnd = HWND(raw_hwnd as *mut _);

        unsafe {
            // Subclass the main window
            let _ = SetWindowSubclass(hwnd, Some(ime_subclass_proc), 1, 0);

            // Also subclass all child windows (WebView2 creates child HWNDs)
            let _ = EnumChildWindows(hwnd, Some(enum_child_callback), LPARAM(0));
        }

        log::info!("IME handler installed on window");
    }
}

#[cfg(windows)]
pub use platform::install_ime_handler;

#[cfg(not(windows))]
pub fn install_ime_handler(_app: &tauri::AppHandle, _window: &tauri::WebviewWindow) {
    // No-op on non-Windows platforms
}
