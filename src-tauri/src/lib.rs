mod clipboard_helper;
mod git_ops;
mod pty_manager;
mod session_store;

use pty_manager::PtyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PtyState::new())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
