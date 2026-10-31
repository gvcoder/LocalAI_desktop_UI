use crate::models::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA foreign_keys=ON;
         CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            model_id TEXT,
            provider TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            tokens INTEGER,
            created_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
         CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
         );",
    )?;
    Ok(conn)
}

pub fn load_settings(conn: &Connection) -> AppResult<Settings> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key='app'", [], |r| r.get(0))
        .optional()?;
    Ok(raw.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default())
}

pub fn save_settings(conn: &Connection, s: &Settings) -> AppResult<()> {
    let json = serde_json::to_string(s).map_err(|e| AppError::Other(e.to_string()))?;
    conn.execute(
        "INSERT INTO settings(key,value) VALUES('app',?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![json],
    )?;
    Ok(())
}

fn row_to_session(r: &rusqlite::Row) -> rusqlite::Result<Session> {
    Ok(Session {
        id: r.get(0)?,
        title: r.get(1)?,
        model_id: r.get(2)?,
        provider: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}

pub fn list_sessions(conn: &Connection) -> AppResult<Vec<Session>> {
    let mut stmt = conn.prepare(
        "SELECT id,title,model_id,provider,created_at,updated_at FROM sessions ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_session)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn create_session(conn: &Connection, title: &str, model_id: Option<&str>, provider: Option<&str>) -> AppResult<Session> {
    let s = Session {
        id: uuid::Uuid::new_v4().to_string(),
        title: title.to_string(),
        model_id: model_id.map(String::from),
        provider: provider.map(String::from),
        created_at: now(),
        updated_at: now(),
    };
    conn.execute(
        "INSERT INTO sessions(id,title,model_id,provider,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6)",
        params![s.id, s.title, s.model_id, s.provider, s.created_at, s.updated_at],
    )?;
    Ok(s)
}

pub fn rename_session(conn: &Connection, id: &str, title: &str) -> AppResult<()> {
    conn.execute("UPDATE sessions SET title=?2, updated_at=?3 WHERE id=?1", params![id, title, now()])?;
    Ok(())
}

pub fn set_session_model(conn: &Connection, id: &str, model_id: &str, provider: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE sessions SET model_id=?2, provider=?3 WHERE id=?1",
        params![id, model_id, provider],
    )?;
    Ok(())
}

pub fn delete_session(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM sessions WHERE id=?1", params![id])?;
    Ok(())
}

pub fn get_messages(conn: &Connection, session_id: &str) -> AppResult<Vec<StoredMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id,session_id,role,content,tokens,created_at FROM messages WHERE session_id=?1 ORDER BY id ASC",
    )?;
    let rows = stmt
        .query_map(params![session_id], |r| {
            Ok(StoredMessage {
                id: r.get(0)?,
                session_id: r.get(1)?,
                role: r.get(2)?,
                content: r.get(3)?,
                tokens: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn save_message(conn: &Connection, session_id: &str, role: &str, content: &str, tokens: Option<i64>) -> AppResult<StoredMessage> {
    let ts = now();
    conn.execute(
        "INSERT INTO messages(session_id,role,content,tokens,created_at) VALUES(?1,?2,?3,?4,?5)",
        params![session_id, role, content, tokens, ts],
    )?;
    let id = conn.last_insert_rowid();
    conn.execute("UPDATE sessions SET updated_at=?2 WHERE id=?1", params![session_id, ts])?;
    Ok(StoredMessage {
        id,
        session_id: session_id.into(),
        role: role.into(),
        content: content.into(),
        tokens,
        created_at: ts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_and_message_roundtrip() {
        let conn = open(Path::new(":memory:")).unwrap();
        let s = create_session(&conn, "Test", Some("llama3"), Some("ollama")).unwrap();
        save_message(&conn, &s.id, "user", "hi", None).unwrap();
        save_message(&conn, &s.id, "assistant", "hello", Some(3)).unwrap();
        let msgs = get_messages(&conn, &s.id).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1].tokens, Some(3));
        rename_session(&conn, &s.id, "Renamed").unwrap();
        assert_eq!(list_sessions(&conn).unwrap()[0].title, "Renamed");
        delete_session(&conn, &s.id).unwrap();
        assert!(get_messages(&conn, &s.id).unwrap().is_empty()); // cascade
    }

    #[test]
    fn settings_default_and_save() {
        let conn = open(Path::new(":memory:")).unwrap();
        let mut s = load_settings(&conn).unwrap();
        assert_eq!(s.ollama_url, "http://localhost:11434");
        s.temperature = 0.2;
        save_settings(&conn, &s).unwrap();
        assert_eq!(load_settings(&conn).unwrap().temperature, 0.2);
    }
}

