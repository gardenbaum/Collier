//! Tauri command handlers organized by domain.
//!
//! Each submodule contains related commands and their helper functions.
//! Import specific commands via their submodule (e.g., `commands::preferences::greet`).

pub mod app_metadata;
pub mod diagnostic_log;
pub mod notifications;
pub mod preferences;
pub mod quick_pane;
pub mod recent_repos;
pub mod recovery;
pub mod workspace_list;
