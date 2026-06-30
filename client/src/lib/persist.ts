const KEY = "synthwave.project.v1";

export function loadState<T>(): T | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

export function saveState<T>(state: T): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota / disabled storage — ignore */
  }
}
