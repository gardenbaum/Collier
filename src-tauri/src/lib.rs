//! Tauri application library entry point.
//!
//! This module serves as the main entry point for the Tauri application.
//! Command implementations are organized in the `commands` module,
//! and shared types are in the `types` module.

mod bindings;
mod commands;
mod types;
mod utils;

mod beads;
// Expose `beads` (and its `runner` sub-module) so integration tests
// in `tests/` can drive the production `run_bd` path without going
// through Tauri's IPC layer. The runner is already a `tauri::command`
// in production, so widening to a `pub mod` doesn't reveal anything
// new externally — the whole surface was reachable through the
// generated bindings before this change.
pub mod beads_export_for_tests {
    pub use crate::beads::runner;
}

use tauri::{Manager, RunEvent, WindowEvent};

// Re-export only what's needed externally
pub use types::DEFAULT_QUICK_PANE_SHORTCUT;

/// Application entry point. Sets up all plugins and initializes the app.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = bindings::generate_bindings();

    // Export TypeScript bindings in debug builds. The generated
    // `src/lib/bindings.ts` is checked in to the repo and rebuilt
    // via the ignored `cargo test export_bindings` (and
    // `tauri-specta`'s CI), so re-exporting at every app start is
    // only useful as a local-dev convenience. Two reasons to gate
    // it behind an env var:
    //
    //   1. Specta v2.0.0-rc.25 made every Rust type a
    //      `NamedDataType` (including `String` and builtins). The
    //      `TypeMap` for our 49 commands is now large enough that
    //      `.export(...)` dominates the cold-start path on a fresh
    //      GitHub Actions runner. The previous 15s pre-warm kills
    //      collier before the export finishes, so the first
    //      wdio `/session` POST — which forces a fresh collier
    //      spawn — pays the full cost and trips the 10-minute
    //      `connectionRetryTimeout` in tests/e2e/wdio.conf.ts.
    //   2. The default export path is the relative
    //      `../src/lib/bindings.ts` (resolved from the spawned
    //      collier's CWD). In CI that's `/tmp/e2e-workspace`, so
    //      the path lands at `/tmp/src/lib/bindings.ts`, which is
    //      never the file the frontend imports.
    //
    // CI sets `E2E_SKIP_EXPORT_BINDINGS=1` to skip the export.
    // Local dev (no env var set) keeps the existing behaviour.
    #[cfg(debug_assertions)]
    {
        let skip = std::env::var_os("E2E_SKIP_EXPORT_BINDINGS").is_some();
        if !skip {
            bindings::export_ts_bindings();
        }
    }

    // Build with common plugins
    let mut app_builder = tauri::Builder::default();

    // Single instance plugin must be registered FIRST
    // When user tries to open a second instance, focus the existing window instead
    #[cfg(desktop)]
    {
        app_builder = app_builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }));
    }

    // Window state plugin - saves/restores window position and size
    // Note: quick-pane is denylisted because it's an NSPanel and calling is_maximized() on it crashes
    // See: https://github.com/tauri-apps/plugins-workspace/issues/1546
    #[cfg(desktop)]
    {
        app_builder = app_builder.plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all())
                .with_denylist(&["quick-pane"])
                .build(),
        );
    }

    // Updater plugin for in-app updates
    #[cfg(desktop)]
    {
        app_builder = app_builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    app_builder = app_builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin({
            #[allow(unused_mut)]
            let mut targets = vec![
                // Always log to stdout for development
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                // Log to system logs on macOS (appears in Console.app)
                #[cfg(target_os = "macos")]
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                    file_name: None,
                }),
            ];
            // Log to webview console — excluded on Linux where the WebKitGTK webview
            // doesn't exist during setup(), causing app.emit() to deadlock on the IPC socket.
            #[cfg(not(target_os = "linux"))]
            targets.push(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::Webview,
            ));
            tauri_plugin_log::Builder::new()
                // Use Debug level in development, Info in production
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .targets(targets)
                .build()
        });

    // macOS: Add NSPanel plugin for native panel behavior
    #[cfg(target_os = "macos")]
    {
        app_builder = app_builder.plugin(tauri_nspanel::init());
    }

    let app_builder = app_builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init());

    // Dev-only: WebSocket on 127.0.0.1:9223 for the MCP driver to
    // drive the app for live UI verification. Released builds skip
    // the bridge entirely (the dep is in regular [dependencies] so
    // it's still compiled, but the plugin is never registered).
    let app_builder = if cfg!(debug_assertions) {
        app_builder.plugin(
            tauri_plugin_mcp_bridge::Builder::new()
                .bind_address("127.0.0.1")
                .build(),
        )
    } else {
        app_builder
    };

    app_builder
        .setup(|app| {
            log::info!("Application starting up");
            log::debug!(
                "App handle initialized for package: {}",
                app.package_info().name
            );

            // Set up global shortcut plugin (without any shortcuts - we register them separately)
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::Builder;

                app.handle().plugin(Builder::new().build())?;
            }

            // Load saved preferences and register the quick pane shortcut
            #[cfg(desktop)]
            {
                let saved_shortcut = commands::preferences::load_quick_pane_shortcut(app.handle());
                let shortcut_to_register = saved_shortcut
                    .as_deref()
                    .unwrap_or(DEFAULT_QUICK_PANE_SHORTCUT);

                log::info!("Registering quick pane shortcut: {shortcut_to_register}");
                commands::quick_pane::register_quick_pane_shortcut(
                    app.handle(),
                    shortcut_to_register,
                )?;
            }

            // Create the quick pane window (hidden) - must be done on main thread
            if let Err(e) = commands::quick_pane::init_quick_pane(app.handle()) {
                log::error!("Failed to create quick pane: {e}");
                // Non-fatal: app can still run without quick pane
            }

            // Start the Beads `.beads/` fs-watcher. The handle is held
            // inside a `WatcherState` (managed below) so the active
            // repo can be swapped at runtime via
            // `attach_watch_repo` from the React side — and so a
            // missing `.beads/` directory is followed by a 2s poll
            // that re-attaches once `bd init` lands.
            let watcher_state = beads::watcher::WatcherState::new();
            if let Err(e) =
                watcher_state.attach(app.handle().clone(), std::path::PathBuf::from("."))
            {
                log::error!("Failed to start beads watcher: {e}");
            }
            app.manage(watcher_state);

            // Per-repo write lock. The `WriteLock` is itself an
            // `Arc<Mutex<HashMap<...>>>` internally, so a single
            // managed instance is safe to share across every command
            // that takes `tauri::State<'_, WriteLock>`.
            app.manage(beads::lock::WriteLock::new());

            // NOTE: Application menu is built from JavaScript for i18n support
            // See src/lib/menu.ts for the menu implementation

            Ok(())
        })
        .invoke_handler(builder.invoke_handler())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match &event {
            // macOS: Hide the main window instead of quitting so the dock icon can reopen it
            // and the quick-pane shortcut works independently of the main window.
            // On other platforms, the close proceeds normally and the app exits.
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } if label == "main" => {
                #[cfg(target_os = "macos")]
                {
                    api.prevent_close();

                    // Save window state before hiding
                    use tauri_plugin_window_state::{AppHandleExt, StateFlags};
                    if let Err(e) = app_handle.save_window_state(StateFlags::all()) {
                        log::warn!("Failed to save window state: {e}");
                    }

                    // Hide the window, not the app. app_handle.hide() calls NSApplication.hide()
                    // which sets system-level hidden state — showing an NSPanel while hidden
                    // causes macOS to unhide the entire app, including the main window.
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.hide();
                        log::info!("Main window hidden");
                    }
                }
            }

            // macOS: Dock icon clicked — reopen the main window if it was hidden
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                if let Some(window) = app_handle.get_webview_window("main") {
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();

                        // The window-state plugin only auto-restores on app startup, not after
                        // a hide/show cycle. Without this the window can appear at stale coords.
                        use tauri_plugin_window_state::{StateFlags, WindowExt};
                        let _ = window.restore_state(StateFlags::all());

                        let _ = window.set_focus();
                        log::info!("Main window reopened from dock");
                    }
                }
            }

            // Cleanup on actual exit (Cmd+Q, menu Quit, or window close on non-macOS).
            // RunEvent::Exit fires reliably before the process exits, unlike ExitRequested
            // which doesn't fire for Cmd+Q on macOS (tauri-apps/tauri#9198).
            RunEvent::Exit => {
                log::info!("Application exiting — performing cleanup");

                // Hide the quick-pane panel to prevent crashes during teardown
                #[cfg(target_os = "macos")]
                {
                    use tauri_nspanel::ManagerExt;
                    if let Ok(panel) = app_handle.get_webview_panel("quick-pane") {
                        panel.hide();
                    }
                }

                // Unregister global shortcuts
                #[cfg(desktop)]
                {
                    use tauri_plugin_global_shortcut::GlobalShortcutExt;
                    if let Err(e) = app_handle.global_shortcut().unregister_all() {
                        log::warn!("Failed to unregister global shortcuts: {e}");
                    }
                }

                log::info!("Cleanup complete");
            }

            _ => {}
        });
}
