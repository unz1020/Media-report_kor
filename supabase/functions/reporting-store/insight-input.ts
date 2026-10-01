export function normalizeInsightInput(input: Record<string, unknown>) {
  const insightId = String(input.insightId || "");
  const expectedUpdatedAt = String(input.expectedUpdatedAt || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(insightId)) throw new Error("INVALID_INSIGHT_ID");
  if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) throw new Error("INVALID_INSIGHT_VERSION");
  const notes = input.notes;
  if (!Array.isArray(notes) || !notes.length || notes.length > 80 ||
    notes.some(note => typeof note !== "string" || !note.trim() || note.length > 4000) ||
    notes.join("").length > 80000) throw new Error("INVALID_INSIGHT_NOTES");
  return { insightId, expectedUpdatedAt, notes: notes.map(note => note.trim()) };
}

// User edits take precedence when the same source report/mail is imported again.
export function retainInsightOverride(metadata: Record<string, any>, previous?: Record<string, any>) {
  const override = previous?.insightOverride;
  if (!override || !Array.isArray(override.notes)) return;
  metadata.insightOverride = override;
  if (metadata.bundle) metadata.bundle.operationNotes = override.notes;
  if (metadata.mailOnly && metadata.input) metadata.input.notes = override.notes;
}
