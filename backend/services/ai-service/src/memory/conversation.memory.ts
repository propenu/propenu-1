const memoryStore = new Map();

export function saveMemory(
  sessionId: string,
  data: any
) {

  memoryStore.set(sessionId, { ...data });
}

export function getMemory(
  sessionId: string
) {
  return memoryStore.get(sessionId);
}