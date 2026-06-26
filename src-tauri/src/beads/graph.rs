//! `bd_graph` — return the whole dependency graph in one call.
//!
//! M3 R7 (see `docs/specs/m3-depgraph.md`). One `bd list --all --json`
//! call gives us every issue + its `dependencies` array (the bd CLI
//! 1.0.5 emits the full dep list on the list envelope, not just on
//! `bd show` — see the integration tests in `tests/fixture.rs` for
//! the documented shape). We turn each issue into one `GraphNode`
//! and each row of its `dependencies` array into one `GraphEdge`,
//! then hand both vectors back to the frontend. No N+1 fan-out.
//!
//! Why a dedicated command instead of letting the frontend walk
//! `bd_list` + `bd_show` itself:
//!
//! 1. **One IPC round-trip** — the React `DepGraphView` renders
//!    after a single `commands.bdGraph(cwd)` call. The alternative
//!    is 1 + N invokes, each gated by Tauri's subprocess budget.
//! 2. **Atomic snapshot** — the graph reflects one bd read, not
//!    a sequence of reads that could interleave with a watcher
//!    update (e.g. an issue created/deleted mid-fetch).
//! 3. **Smaller payload** — the frontend only needs id + title +
//!    status + priority + issue_type per node, not the full Issue
//!    (no description, owner, labels, timestamps, parent, etc.).
//!    A 500-issue workspace serialises to a few KB instead of the
//!    ~100KB a full `Vec<Issue>` round-trip would cost.

use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::beads::{runner, BdError, BdResult, Graph, GraphEdge, GraphNode, Issue};

/// Run `bd list --all --json` in `cwd` and return a `Graph` with
/// one node per issue and one edge per `Dependency` row.
///
/// Edge direction follows `Dependency` semantics: each edge points
/// from the dependent issue (the enclosing `Issue.id`) TO the
/// issue being depended on (`Dependency.dependency_id`). The
/// frontend reverses this for arrow rendering when it wants
/// "X blocks Y" semantics.
#[tauri::command]
#[specta::specta]
pub async fn bd_graph(cwd: String) -> BdResult<Graph> {
    let path = PathBuf::from(&cwd);
    let output = runner::run_bd(&["list", "--all", "--json"], &path).await?;
    let value = match output {
        runner::BdOutput::Json { value } => value,
        runner::BdOutput::Text { value } => {
            return Err(BdError::ParseError {
                message: format!("expected JSON envelope, got text: {value}"),
            });
        }
    };
    let data = value
        .get("data")
        .ok_or_else(|| BdError::ParseError {
            message: "missing 'data' field in JSON envelope".to_string(),
        })?
        .clone();
    let issues: Vec<Issue> = serde_json::from_value(data).map_err(|e| BdError::ParseError {
        message: format!("failed to parse Graph nodes from 'data' field: {e}"),
    })?;

    // De-dupe nodes by id via BTreeMap for stable iteration order
    // (BTreeMap = sorted by key = deterministic across runs of the
    // same fixture, which the E2E spec depends on). The bd CLI may
    // occasionally emit the same issue twice on transient race
    // conditions; we silently keep the last write, which is fine
    // because all duplicates carry the same id.
    let mut by_id: BTreeMap<String, Issue> = BTreeMap::new();
    for issue in issues {
        by_id.insert(issue.id.clone(), issue);
    }

    let nodes: Vec<GraphNode> = by_id
        .values()
        .map(|issue| GraphNode {
            id: issue.id.clone(),
            title: issue.title.clone(),
            status: issue.status.clone(),
            priority: issue.priority,
            issue_type: issue.issue_type,
        })
        .collect();

    // Edges: walk each issue's `dependencies` Vec and emit one
    // GraphEdge per row, regardless of whether the target exists
    // in the same fixture. An orphan edge (target not in `nodes`)
    // is benign for layout — dagre drops nodes that aren't in its
    // graph — and surfacing it lets the UI show "missing target"
    // styling if it ever wants to.
    let mut edges: Vec<GraphEdge> = Vec::new();
    for issue in by_id.values() {
        for dep in &issue.dependencies {
            edges.push(GraphEdge {
                source: issue.id.clone(),
                target: dep.dependency_id.clone(),
                dep_type: dep.dependency_type,
            });
        }
    }

    Ok(Graph { nodes, edges })
}

#[cfg(test)]
mod tests {
    // Unit tests for the bd→Graph mapping live in `tests/graph.rs`
    // (integration test) so they can run against a real `bd` via
    // the production `run_bd` path. The pure function here is
    // small enough that an end-to-end test covers every branch
    // (empty nodes, single node, multi-edge chain, parent-child,
    // unknown target).

    use super::*;

    /// Sanity: the public types serialise with camelCase keys so
    /// the specta-generated TypeScript bridge sees `source` /
    /// `target` / `depType`, not the Rust snake_case. Catches a
    /// accidental `#[serde(rename_all = "snake_case")]` typo that
    /// would otherwise break the React `DepGraphView` rendering
    /// at runtime (the TypeScript type would lie about the shape).
    #[test]
    fn graph_types_use_camel_case_wire_format() {
        let node = GraphNode {
            id: "n1".to_string(),
            title: "T".to_string(),
            status: crate::beads::ISSUE_STATUS_OPEN.to_string(),
            priority: crate::beads::IssuePriority::P1,
            issue_type: crate::beads::IssueType::Task,
        };
        let edge = GraphEdge {
            source: "s".to_string(),
            target: "t".to_string(),
            dep_type: crate::beads::DependencyType::Blocks,
        };
        let graph = Graph {
            nodes: vec![node],
            edges: vec![edge],
        };
        let json = serde_json::to_value(&graph).expect("serialize");
        let node_json = json
            .get("nodes")
            .and_then(|v| v.as_array())
            .expect("nodes array");
        let edge_json = json
            .get("edges")
            .and_then(|v| v.as_array())
            .expect("edges array");
        let first_node = node_json.first().expect("first node");
        // camelCase keys the React component expects:
        assert!(
            first_node.get("issueType").is_some(),
            "expected issueType key"
        );
        assert!(
            first_node.get("issue_type").is_none(),
            "rust field must rename to camelCase on the wire"
        );
        let first_edge = edge_json.first().expect("first edge");
        assert!(first_edge.get("depType").is_some(), "expected depType key");
        assert!(
            first_edge.get("dep_type").is_none(),
            "rust field must rename to camelCase on the wire"
        );
    }
}
