type SchedulerChangeListener = () => void;

const listeners = new Set<SchedulerChangeListener>();

export function onSchedulerChange(listener: SchedulerChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSchedulerChange(): void {
  for (const listener of listeners) {
    listener();
  }
}
