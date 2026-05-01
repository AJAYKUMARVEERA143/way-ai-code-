// Way AI Code — Tauri backend
// File system commands: read_dir, read_file, write_file,
// create_file, delete_path, rename_path, create_dir,
// get_home_dir, get_metadata, search_files

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::command;
use tokio::process::Command as TokioCommand;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub name:     String,
    pub path:     String,
    pub is_dir:   bool,
    pub size:     u64,
    pub ext:      String,
    pub modified: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DirResult {
    pub entries: Vec<FileEntry>,
    pub path:    String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitFile {
    pub path:   String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GitStatus {
    pub branch:   String,
    pub staged:   Vec<GitFile>,
    pub unstaged: Vec<GitFile>,
    pub untracked: Vec<GitFile>,
    pub conflicts: Vec<GitFile>,
    pub clean:    bool,
    pub raw:      String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolInfo {
    pub id:           String,
    pub label:        String,
    pub command:      String,
    pub installed:    bool,
    pub version:      String,
    pub path:         String,
    pub install_hint: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PackageScript {
    pub name:    String,
    pub command: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CommandOutput {
    pub success: bool,
    pub code:    i32,
    pub stdout:  String,
    pub stderr:  String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn file_ext(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

fn modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

fn command_candidates(command: &str) -> Vec<&str> {
    match command {
        "python" => vec!["python", "py", "python3"],
        "node" => vec!["node"],
        "npm" => vec!["npm", "npm.cmd"],
        "git" => vec!["git"],
        "cargo" => vec!["cargo"],
        other => vec![other],
    }
}

fn which_command(command: &str) -> Option<String> {
    let candidates = command_candidates(command);
    for candidate in candidates {
        #[cfg(target_os = "windows")]
        let output = Command::new("cmd")
            .args(["/C", "where", candidate])
            .output();

        #[cfg(not(target_os = "windows"))]
        let output = Command::new("which")
            .arg(candidate)
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn command_version(command_path: &str, command_id: &str) -> String {
    let arg = if command_id == "npm" { "--version" } else { "--version" };
    match Command::new(command_path).arg(arg).output() {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            if stdout.is_empty() { stderr } else { stdout }
        }
        Err(_) => String::new(),
    }
}

fn run_command_in_dir(root: &str, command: &str, args: &[String], timeout_secs: u64) -> Result<CommandOutput, String> {
    let command_path = which_command(command).unwrap_or_else(|| command.to_string());
    let mut child = Command::new(command_path)
        .current_dir(root)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start {}: {}", command, e))?;

    let start = Instant::now();
    loop {
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        if start.elapsed() > Duration::from_secs(timeout_secs.max(5)) {
            let _ = child.kill();
            let output = child.wait_with_output().map_err(|e| e.to_string())?;
            return Ok(CommandOutput {
                success: false,
                code: -1,
                stdout: String::from_utf8_lossy(&output.stdout).trim_end().to_string(),
                stderr: format!("{}\nCommand timed out after {}s", String::from_utf8_lossy(&output.stderr).trim_end(), timeout_secs),
            });
        }
        thread::sleep(Duration::from_millis(80));
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(CommandOutput {
        success: output.status.success(),
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).trim_end().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim_end().to_string(),
    })
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[command]
fn read_dir(path: String, show_hidden: bool) -> Result<DirResult, String> {
    let p = PathBuf::from(&path);
    if !p.exists() { return Err(format!("Path not found: {}", path)); }
    if !p.is_dir() { return Err(format!("Not a directory: {}", path)); }

    let iter = fs::read_dir(&p).map_err(|e| e.to_string())?;
    let mut entries: Vec<FileEntry> = iter
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name();
            show_hidden || !is_hidden(&name.to_string_lossy())
        })
        .map(|e| {
            let ep   = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            let is_dir = ep.is_dir();
            FileEntry {
                name,
                path:     ep.to_string_lossy().to_string(),
                is_dir,
                size:     if is_dir { 0 } else { fs::metadata(&ep).map(|m| m.len()).unwrap_or(0) },
                ext:      file_ext(&ep),
                modified: modified_ms(&ep),
            }
        })
        .collect();

    // dirs first, then alphabetical
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(DirResult { entries, path: p.to_string_lossy().to_string() })
}

#[command]
fn read_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("Read error: {}", e))?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err(format!("File too large to read (max 50 MB)"));
    }
    fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))
}

#[command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if content.len() > 50 * 1024 * 1024 {
        return Err(format!("Content too large to write (max 50 MB)"));
    }
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| format!("Write error: {}", e))
}

#[command]
fn create_file_cmd(path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() { fs::remove_dir_all(p).map_err(|e| e.to_string()) }
    else          { fs::remove_file(p).map_err(|e| e.to_string()) }
}

#[command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[command]
fn create_dir_cmd(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[command]
fn get_home_dir() -> String {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/"))
        .to_string_lossy()
        .to_string()
}

#[command]
fn get_metadata(path: String) -> Result<FileEntry, String> {
    let p = PathBuf::from(&path);
    if !p.exists() { return Err(format!("Not found: {}", path)); }
    let name   = p.file_name().unwrap_or_default().to_string_lossy().to_string();
    let is_dir = p.is_dir();
    Ok(FileEntry {
        name,
        path:     p.to_string_lossy().to_string(),
        is_dir,
        size:     if is_dir { 0 } else { fs::metadata(&p).map(|m| m.len()).unwrap_or(0) },
        ext:      file_ext(&p),
        modified: modified_ms(&p),
    })
}

#[command]
fn search_files(root: String, query: String, max: usize) -> Vec<FileEntry> {
    let q = query.to_lowercase();
    let mut results = Vec::new();
    walk_search(&PathBuf::from(root), &q, &mut results, max);
    results
}

fn walk_search(dir: &Path, query: &str, results: &mut Vec<FileEntry>, max: usize) {
    if results.len() >= max { return; }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if results.len() >= max { break; }
            let ep   = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if is_hidden(&name) { continue; }
            if name.to_lowercase().contains(query) {
                let is_dir = ep.is_dir();
                results.push(FileEntry {
                    name,
                    path:     ep.to_string_lossy().to_string(),
                    is_dir,
                    size:     if is_dir { 0 } else { fs::metadata(&ep).map(|m| m.len()).unwrap_or(0) },
                    ext:      file_ext(&ep),
                    modified: modified_ms(&ep),
                });
            }
            if ep.is_dir() { walk_search(&ep, query, results, max); }
        }
    }
}

#[command]
fn detect_tools() -> Vec<ToolInfo> {
    [
        ("python", "Python", "Install Python from python.org or Microsoft Store"),
        ("node", "Node.js", "Install Node.js LTS from nodejs.org"),
        ("npm", "NPM", "NPM is included with Node.js LTS"),
        ("git", "Git", "Install Git for Windows from git-scm.com"),
    ]
    .into_iter()
    .map(|(id, label, hint)| {
        let path = which_command(id).unwrap_or_default();
        let installed = !path.is_empty();
        ToolInfo {
            id: id.to_string(),
            label: label.to_string(),
            command: id.to_string(),
            installed,
            version: if installed { command_version(&path, id) } else { String::new() },
            path,
            install_hint: hint.to_string(),
        }
    })
    .collect()
}

#[command]
fn package_scripts(root: String) -> Result<Vec<PackageScript>, String> {
    let package_path = PathBuf::from(root).join("package.json");
    if !package_path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(&package_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("package.json parse error: {}", e))?;
    let scripts = json
        .get("scripts")
        .and_then(|v| v.as_object())
        .map(|obj| {
            let mut scripts: Vec<PackageScript> = obj
                .iter()
                .filter_map(|(name, value)| value.as_str().map(|cmd| PackageScript { name: name.clone(), command: cmd.to_string() }))
                .collect();
            scripts.sort_by(|a, b| a.name.cmp(&b.name));
            scripts
        })
        .unwrap_or_default();
    Ok(scripts)
}

#[command]
async fn run_tool_command(root: String, tool: String, args: Vec<String>, timeout_secs: u64) -> Result<CommandOutput, String> {
    let allowed = ["npm", "node", "python", "py", "python3", "git", "cargo"];
    if !allowed.contains(&tool.as_str()) {
        return Err(format!("Tool not allowed: {}", tool));
    }

    let command_path = which_command(&tool).unwrap_or(tool.clone());
    let mut cmd = TokioCommand::new(command_path);
    cmd.current_dir(root)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = tokio::time::timeout(Duration::from_secs(timeout_secs.max(5)), cmd.output())
        .await
        .map_err(|_| format!("Command timed out after {}s", timeout_secs))?
        .map_err(|e| format!("Failed to run {}: {}", tool, e))?;

    Ok(CommandOutput {
        success: output.status.success(),
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).trim_end().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim_end().to_string(),
    })
}

#[command]
fn git_clone(parent_dir: String, repo_url: String) -> Result<CommandOutput, String> {
    if repo_url.trim().is_empty() {
        return Err("Repository URL is required".to_string());
    }
    if !repo_url.starts_with("https://") {
        return Err("Only HTTPS git URLs are allowed".to_string());
    }
    let blocked = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "file://", "git://"];
    for marker in blocked {
        if repo_url.contains(marker) {
            return Err(format!("Repository URL contains blocked pattern: {}", marker));
        }
    }
    let parent = PathBuf::from(&parent_dir);
    if !parent.exists() || !parent.is_dir() {
        return Err(format!("Clone target folder not found: {}", parent_dir));
    }
    run_command_in_dir(
        &parent_dir,
        "git",
        &["clone".to_string(), "--depth".to_string(), "1".to_string(), repo_url],
        120,
    )
}

fn run_git(root: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|e| format!("git failed to start: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim_end().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn parse_git_status(raw: &str) -> GitStatus {
    let mut branch = "main".to_string();
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicts = Vec::new();

    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            branch = rest
                .split("...")
                .next()
                .unwrap_or(rest)
                .split_whitespace()
                .next()
                .unwrap_or(rest)
                .to_string();
            continue;
        }

        if line.len() < 3 { continue; }
        let mut chars = line.chars();
        let index = chars.next().unwrap_or(' ');
        let worktree = chars.next().unwrap_or(' ');
        let path = line.get(3..).unwrap_or("").to_string();
        if path.is_empty() { continue; }

        if index == '?' && worktree == '?' {
            untracked.push(GitFile { path, status: "U".to_string() });
            continue;
        }

        let conflict_pair = format!("{}{}", index, worktree);
        if ["UU", "AA", "DD", "DU", "UD", "UA", "AU"].contains(&conflict_pair.as_str()) {
            conflicts.push(GitFile { path, status: conflict_pair });
            continue;
        }

        if index != ' ' {
            staged.push(GitFile { path: path.clone(), status: index.to_string() });
        }
        if worktree != ' ' {
            unstaged.push(GitFile { path, status: worktree.to_string() });
        }
    }

    let clean = staged.is_empty() && unstaged.is_empty() && untracked.is_empty() && conflicts.is_empty();
    GitStatus { branch, staged, unstaged, untracked, conflicts, clean, raw: raw.to_string() }
}

#[command]
fn git_status(root: String) -> Result<GitStatus, String> {
    run_git(&root, &["status", "--porcelain=v1", "--branch"]).map(|raw| parse_git_status(&raw))
}

#[command]
fn git_log(root: String, max: usize) -> Result<Vec<String>, String> {
    let n = max.clamp(1, 50).to_string();
    let out = run_git(&root, &["log", "--oneline", "-n", &n])?;
    Ok(out.lines().map(|line| line.to_string()).collect())
}

#[command]
fn git_stage(root: String, path: String) -> Result<(), String> {
    run_git(&root, &["add", "--", &path]).map(|_| ())
}

#[command]
fn git_unstage(root: String, path: String) -> Result<(), String> {
    run_git(&root, &["restore", "--staged", "--", &path]).map(|_| ())
}

#[command]
fn git_commit(root: String, message: String) -> Result<String, String> {
    if message.trim().is_empty() {
        return Err("Commit message is required".to_string());
    }
    run_git(&root, &["commit", "-m", message.trim()])
}

#[command]
fn git_push(root: String) -> Result<String, String> {
    run_git(&root, &["push"])
}

#[command]
fn git_push_with_token(root: String, username: String, token: String) -> Result<String, String> {
    if token.trim().is_empty() || username.trim().is_empty() {
        return run_git(&root, &["push"]);
    }
    let remote_url = run_git(&root, &["remote", "get-url", "origin"])
        .unwrap_or_default();
    let remote_url = remote_url.trim();
    let auth_url = if remote_url.starts_with("https://github.com/") {
        let rest = &remote_url["https://github.com/".len()..];
        format!("https://{}:{}@github.com/{}", username.trim(), token.trim(), rest)
    } else if remote_url.starts_with("https://") {
        let rest = &remote_url["https://".len()..];
        format!("https://{}:{}@{}", username.trim(), token.trim(), rest)
    } else {
        return run_git(&root, &["push"]);
    };
    run_git(&root, &["push", &auth_url])
}

#[command]
fn git_pull(root: String) -> Result<String, String> {
    run_git(&root, &["pull", "--ff-only"])
}

// ── Main ──────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_dir,
            read_file,
            write_file,
            create_file_cmd,
            delete_path,
            rename_path,
            create_dir_cmd,
            get_home_dir,
            get_metadata,
            search_files,
            detect_tools,
            package_scripts,
            run_tool_command,
            git_clone,
            git_status,
            git_log,
            git_stage,
            git_unstage,
            git_commit,
            git_push,
            git_pull,
        git_push_with_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
