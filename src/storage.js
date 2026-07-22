// localStorage persistence for completed sessions.
//
// The data model is intentionally generic: we store raw keystroke traces and
// the shown operands for every question, so new classification rules can be
// added later and applied retroactively without re-collecting data.

const KEY = 'zetamac-plus-plus.sessions.v1';

export function loadSessions() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to load sessions', e);
    return [];
  }
}

export function saveSession(session) {
  const sessions = loadSessions();
  sessions.push(session);
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Failed to save session', e);
  }
  return session;
}

export function deleteSession(id) {
  const sessions = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(sessions));
  return sessions;
}

export function clearSessions() {
  localStorage.removeItem(KEY);
}

export function getSession(id) {
  return loadSessions().find((s) => s.id === id) || null;
}

export function newSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
