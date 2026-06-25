use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::beads::{BdError, Issue};

use super::*;

// ============================================================================
// JsonlResult
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct JsonlResult {
    pub issues: Vec<Issue>,
    pub skipped_lines: Vec<(usize, String)>,
}

// ============================================================================
// read_jsonl
// ============================================================================

/// Find and read JSONL issue files from a Beads workspace.
/// Returns issues sorted by `created_at` descending.
pub async fn read_jsonl(cwd: &Path) -> BdResult<JsonlResult> {
    let beads_dir = cwd.join(".beads");

    // Check for Dolt-only workspace (config.yaml with backend: dolt, no JSONL)
    let config_path = beads_dir.join("config.yaml");
    if config_path.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&config_path).await {
            if content.contains("backend:") && content.contains("dolt") {
                return Err(BdError::DoltOnly {
                    message: "Workspace uses Dolt backend, no JSONL file available".to_string(),
                });
            }
        }
    }

    // Find JSONL files
    let jsonl_path = find_jsonl_path(&beads_dir)?;

    // Read and parse
    let content = tokio::fs::read_to_string(&jsonl_path)
        .await
        .map_err(|e| BdError::IoError {
            message: format!("Failed to read JSONL file: {e}"),
        })?;

    parse_jsonl_content(&content)
}

/// Find the JSONL file path (.beads/*.jsonl or beads.jsonl in cwd).
/// If multiple, returns the most recently modified.
fn find_jsonl_path(beads_dir: &Path) -> BdResult<PathBuf> {
    // Try .beads/*.jsonl first
    let jsonl_pattern = beads_dir.join("*.jsonl");
    let pattern_str = jsonl_pattern.to_string_lossy();

    let matches: Vec<PathBuf> = glob::glob(&pattern_str)
        .map_err(|e| BdError::IoError {
            message: format!("Failed to glob JSONL files: {e}"),
        })?
        .filter_map(Result::ok)
        .collect();

    if !matches.is_empty() {
        // Return most recently modified
        let most_recent = matches
            .into_iter()
            .max_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok())
            .unwrap();
        return Ok(most_recent);
    }

    // Fallback: beads.jsonl in cwd (parent of .beads/)
    let fallback = beads_dir.parent().unwrap().join("beads.jsonl");
    if fallback.exists() {
        return Ok(fallback);
    }

    Err(BdError::IoError {
        message: format!("No .beads/ directory found at {:?}", beads_dir),
    })
}

/// Parse JSONL content line by line, skipping malformed entries.
fn parse_jsonl_content(content: &str) -> BdResult<JsonlResult> {
    let mut issues = Vec::new();
    let mut skipped_lines = Vec::new();

    for (line_no, line) in content.lines().enumerate() {
        let line_no = line_no + 1; // 1-indexed
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<Issue>(trimmed) {
            Ok(issue) => issues.push(issue),
            Err(_) => skipped_lines.push((line_no, line.to_string())),
        }
    }

    // Sort by created_at descending
    issues.sort_by_key(|issue| std::cmp::Reverse(issue.created_at));

    Ok(JsonlResult {
        issues,
        skipped_lines,
    })
}

// ============================================================================
// Tauri Command
// ============================================================================

#[tauri::command]
#[specta::specta]
pub async fn read_issues_jsonl(cwd: String) -> Result<JsonlResult, BdError> {
    read_jsonl(Path::new(&cwd)).await
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, Utc};
    use tempfile::TempDir;

    fn make_issue(id: &str, created_at: &str) -> Issue {
        Issue {
            id: id.to_string(),
            title: format!("Issue {id}"),
            status: IssueStatus::Open,
            priority: IssuePriority::P2,
            issue_type: IssueType::Bug,
            created_at: DateTime::parse_from_rfc3339(created_at)
                .unwrap()
                .with_timezone(&Utc),
            updated_at: None,
            closed_at: None,
            description: None,
            owner: None,
            labels: vec![],
            dependencies: vec![],
            dependents: vec![],
            dependency_count: 0,
            dependent_count: 0,
            comment_count: 0,
            parent: None,
            acceptance_criteria: None,
            external_ref: None,
        }
    }

    fn write_jsonl(dir: &TempDir, name: &str, lines: &[String]) -> PathBuf {
        let path = dir.path().join(".beads").join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, lines.join("\n")).unwrap();
        path
    }

    #[test]
    fn test_mixed_lines() {
        let temp = TempDir::new().unwrap();
        // 3 valid + 1 malformed + 1 valid = 4 issues, 1 skipped
        let lines: Vec<String> = vec![
            serde_json::to_string(&make_issue("beads-1", "2026-01-01T00:00:00Z")).unwrap(),
            serde_json::to_string(&make_issue("beads-2", "2026-01-02T00:00:00Z")).unwrap(),
            "INVALID JSON".to_string(),
            serde_json::to_string(&make_issue("beads-3", "2026-01-03T00:00:00Z")).unwrap(),
            serde_json::to_string(&make_issue("beads-4", "2026-01-04T00:00:00Z")).unwrap(),
        ];
        write_jsonl(&temp, "issues.jsonl", &lines);

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(read_jsonl(temp.path())).unwrap();

        assert_eq!(result.issues.len(), 4, "Expected 4 issues parsed");
        assert_eq!(result.skipped_lines.len(), 1, "Expected 1 skipped line");
        assert_eq!(result.skipped_lines[0].0, 3, "Malformed line is line 3");
    }

    #[test]
    fn test_no_beads_dir() {
        let temp = TempDir::new().unwrap();
        // No .beads directory

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(read_jsonl(temp.path()));
        assert!(matches!(result, Err(BdError::IoError { .. })));
    }

    #[test]
    fn test_dolt_only() {
        let temp = TempDir::new().unwrap();
        // Create .beads/config.yaml with backend: dolt
        let beads_dir = temp.path().join(".beads");
        std::fs::create_dir_all(&beads_dir).unwrap();
        std::fs::write(
            beads_dir.join("config.yaml"),
            "backend: dolt\ndolt_branch: main\n",
        )
        .unwrap();
        // No JSONL files

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(read_jsonl(temp.path()));
        assert!(matches!(result, Err(BdError::DoltOnly { .. })));
    }
}
