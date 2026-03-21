mod agent_audit;
mod agent_config;
mod agent_protocol;
mod agent_server;
mod browser_ops;
mod claude_manager;
mod clipboard_helper;
mod file_ops;
mod git_ops;
mod pty_manager;
mod session_store;
mod sftp_ops;
mod ssh_manager;
mod ssh_presets;

use claude_manager::ClaudeState;
use pty_manager::PtyState;
use ssh_manager::SshState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ssh_state = SshState::new();
    // Clone Arc references for the agent server before moving SshState into Tauri
    let agent_sessions = Arc::clone(&ssh_state.sessions);
    let agent_output_tx = ssh_state.output_tx.clone();

    tauri::Builder::default()
        .manage(PtyState::new())
        .manage(ClaudeState::new())
        .manage(ssh_state)
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start agent WebSocket server for AI CLI integration
            // Use std::thread + new Tokio runtime since Tauri's setup doesn't run inside a Tokio context
            let token = uuid::Uuid::new_v4().to_string();
            let sessions = Arc::clone(&agent_sessions);
            let output_tx = agent_output_tx.clone();
            let audit_log = Arc::new(agent_audit::AuditLog::new());
            let audit_for_server = Arc::clone(&audit_log);
            let app_handle = app.handle().clone();
            app.handle().manage(audit_log);
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
                rt.block_on(async move {
                    agent_server::start_agent_server_with_refs(sessions, output_tx, token, audit_for_server, app_handle).await;
                });
            });

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
            git_ops::git_ahead_behind,
            git_ops::git_branches,
            git_ops::git_switch_branch,
            git_ops::git_create_branch,
            git_ops::git_push,
            git_ops::git_pull,
            git_ops::git_tags,
            git_ops::git_create_tag,
            git_ops::git_delete_tag,
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
            ssh_manager::ssh_open_channel,
            ssh_manager::ssh_close_channel,
            ssh_manager::ssh_write,
            ssh_manager::ssh_resize,
            ssh_manager::ssh_disconnect,
            sftp_ops::sftp_list_dir,
            sftp_ops::sftp_download,
            sftp_ops::sftp_upload,
            sftp_ops::sftp_mkdir,
            sftp_ops::sftp_delete,
            sftp_ops::sftp_create_file,
            sftp_ops::sftp_chmod,
            sftp_ops::sftp_rename,
            sftp_ops::sftp_copy,
            sftp_ops::sftp_download_to_temp,
            sftp_ops::sftp_stat,
            ssh_presets::ssh_preset_list,
            ssh_presets::ssh_preset_save,
            ssh_presets::ssh_preset_delete,
            ssh_presets::ssh_session_list,
            ssh_presets::ssh_session_save,
            ssh_presets::ssh_session_delete,
            browser_ops::create_browser_webview,
            browser_ops::navigate_browser,
            browser_ops::browser_go_back,
            browser_ops::browser_go_forward,
            browser_ops::browser_reload,
            browser_ops::resize_browser_webview,
            browser_ops::show_browser_webview,
            browser_ops::hide_browser_webview,
            browser_ops::destroy_browser_webview,
            browser_ops::forward_console_log,
            browser_ops::forward_browser_selection,
            browser_ops::capture_browser_screenshot,
            browser_ops::receive_browser_screenshot,
            browser_ops::write_screenshot,
            browser_ops::open_browser_devtools,
            browser_ops::flush_browser_logs,
            agent_audit::agent_get_audit_log,
            claude_manager::claude_agent_workspace_path,
            claude_manager::claude_ssh_workspace,
            claude_manager::claude_check_installed,
            claude_manager::claude_send_message,
            claude_manager::claude_cancel,
            claude_manager::claude_save_temp_file,
            claude_manager::claude_cleanup_temp_files,
            claude_manager::claude_discover_commands,
            claude_manager::claude_list_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
