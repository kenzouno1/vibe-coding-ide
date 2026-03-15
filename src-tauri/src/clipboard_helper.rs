/// Read file paths from Windows clipboard (CF_HDROP format)
/// Returns file paths as text, or clipboard text if no files
#[tauri::command]
pub fn read_clipboard_files() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::ptr;

        unsafe {
            // Open clipboard
            if OpenClipboard(ptr::null_mut()) == 0 {
                return Err("Failed to open clipboard".into());
            }

            // Try CF_HDROP (file list) first
            let hdrop = GetClipboardData(CF_HDROP);
            if !hdrop.is_null() {
                let count = DragQueryFileW(hdrop as _, 0xFFFFFFFF, ptr::null_mut(), 0);
                let mut paths = Vec::new();

                for i in 0..count {
                    let len = DragQueryFileW(hdrop as _, i, ptr::null_mut(), 0);
                    let mut buf = vec![0u16; (len + 1) as usize];
                    DragQueryFileW(hdrop as _, i, buf.as_mut_ptr(), len + 1);
                    let path = String::from_utf16_lossy(&buf[..len as usize]);
                    paths.push(format!("\"{}\"", path));
                }

                CloseClipboard();
                if !paths.is_empty() {
                    return Ok(Some(paths.join(" ")));
                }
            }

            // Try CF_UNICODETEXT
            let htext = GetClipboardData(CF_UNICODETEXT);
            if !htext.is_null() {
                let ptr = GlobalLock(htext) as *const u16;
                if !ptr.is_null() {
                    let mut len = 0;
                    while *ptr.add(len) != 0 {
                        len += 1;
                    }
                    let text = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len));
                    GlobalUnlock(htext);
                    CloseClipboard();
                    return Ok(Some(text));
                }
            }

            CloseClipboard();
        }

        Ok(None)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

// Win32 FFI bindings
#[cfg(target_os = "windows")]
const CF_HDROP: u32 = 15;
#[cfg(target_os = "windows")]
const CF_UNICODETEXT: u32 = 13;

#[cfg(target_os = "windows")]
extern "system" {
    fn OpenClipboard(hwnd: *mut std::ffi::c_void) -> i32;
    fn CloseClipboard() -> i32;
    fn GetClipboardData(format: u32) -> *mut std::ffi::c_void;
    fn GlobalLock(hmem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn GlobalUnlock(hmem: *mut std::ffi::c_void) -> i32;
    fn DragQueryFileW(
        hdrop: *mut std::ffi::c_void,
        index: u32,
        file: *mut u16,
        size: u32,
    ) -> u32;
}
