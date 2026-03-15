mod browser_ops;
mod clipboard_helper;
mod file_ops;
mod git_ops;
mod ime_handler;
mod pty_manager;
mod session_store;
mod sftp_ops;
mod ssh_manager;
mod ssh_presets;

use pty_manager::PtyState;
use ssh_manager::SshState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyState::new())
        .manage(SshState::new())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Install native IME handler for Vietnamese input (EVKey/UniKey)
            if let Some(window) = app.webview_windows().values().next() {
                ime_handler::install_ime_handler(app.handle(), window);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty_manager::spawn_pty,
            pty_manager::write_pty,
            pty_manager::resize_pty,
            pty_manager::kill_pty,
            git_ops::git_status,
            git_ops::git_diff,
            git_ops::git_add,
            git_ops::git_reset,
            git_ops::git_commit,
            git_ops::git_branch,
            git_ops::git_log,
            session_store::save_session,
            session_store::load_session,
            session_store::list_projects,
            session_store::add_project,
            session_store::remove_project,
            clipboard_helper::read_clipboard_files,
            file_ops::list_directory,
            file_ops::read_file,
            file_ops::write_file,
            file_ops::create_file,
            file_ops::create_directory,
            file_ops::rename_entry,
            file_ops::delete_entry,
            ssh_manager::ssh_connect,
            ssh_manager::ssh_write,
            ssh_manager::ssh_resize,
            ssh_manager::ssh_disconnect,
            sftp_ops::sftp_list_dir,
            sftp_ops::sftp_download,
            sftp_ops::sftp_upload,
            sftp_ops::sftp_mkdir,
            sftp_ops::sftp_delete,
            ssh_presets::ssh_preset_list,
            ssh_presets::ssh_preset_save,
            ssh_presets::ssh_preset_delete,
            browser_ops::create_browser_webview,
            browser_ops::navigate_browser,
            browser_ops::browser_go_back,
            browser_ops::browser_go_forward,
            browser_ops::browser_reload,
            browser_ops::resize_browser_webview,
            browser_ops::show_browser_webview,
            browser_ops::hide_browser_webview,
            browser_ops::destroy_browser_webview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
