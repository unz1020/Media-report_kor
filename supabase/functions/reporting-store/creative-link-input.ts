// This is only an untrusted pointer into audited inventory, never metric data.
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_CREATIVE_LINK_INPUT");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (Object.keys(value).some(key => ![...required, ...optional].includes(key)) ||
    required.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error("INVALID_CREATIVE_LINK_KEYS");
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error("INVALID_CREATIVE_LINK_TEXT");
  }
  return value;
}
export function normalizeCreativeLinkInput(value: unknown) {
  const input = record(value);
  keys(input, ["advertiser", "month", "importId", "expectedUpdatedAt", "performanceLink"], ["operation"]);
  const advertiser = text(input.advertiser, 200);
  const month = text(input.month, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("INVALID_CREATIVE_LINK_MONTH");
  const importId = text(input.importId, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId)) throw new Error("INVALID_CREATIVE_LINK_ID");
  const expectedUpdatedAt = text(input.expectedUpdatedAt, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(expectedUpdatedAt) ||
    Number.isNaN(Date.parse(expectedUpdatedAt))) throw new Error("INVALID_CREATIVE_LINK_VERSION");
  let performanceLink: { sourceFamily: string; platform: string; placement: string; creative: string } | null = null;
  if (input.performanceLink !== null) {
    const link = record(input.performanceLink);
    keys(link, ["sourceFamily", "platform", "placement", "creative"]);
    performanceLink = { sourceFamily: text(link.sourceFamily, 2000), platform: text(link.platform, 120),
      placement: text(link.placement, 200), creative: text(link.creative, 200) };
  }
  let operation: { status: "예정" | "집행 중" | "중단" | "종료"; asOf: string; note?: string } | null | undefined;
  if (Object.prototype.hasOwnProperty.call(input, "operation")) {
    if (input.operation === null) operation = null;
    else {
      const statement = record(input.operation);
      keys(statement, ["status", "asOf"], ["note"]);
      const status = text(statement.status, 10);
      if (!["예정", "집행 중", "중단", "종료"].includes(status)) throw new Error("INVALID_CREATIVE_LINK_OPERATION_STATUS");
      const asOf = text(statement.asOf, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf)) ||
        new Date(asOf + "T00:00:00Z").toISOString().slice(0, 10) !== asOf) {
        throw new Error("INVALID_CREATIVE_LINK_OPERATION_DATE");
      }
      operation = { status: status as "예정" | "집행 중" | "중단" | "종료", asOf };
      if (Object.prototype.hasOwnProperty.call(statement, "note")) {
        if (typeof statement.note !== "string" || statement.note.length > 1000 || /[\u0000-\u001f\u007f-\u009f]/.test(statement.note)) {
          throw new Error("INVALID_CREATIVE_LINK_OPERATION_NOTE");
        }
        operation.note = statement.note;
      }
    }
  }
  return { advertiser, month, importId, expectedUpdatedAt, performanceLink, ...(operation !== undefined ? { operation } : {}) };
}

// Reimporting the same source proof may refresh evidence, but omitted AE annotations survive.
// Only copy the two annotation leaves, never source metrics or the rest of an older proof.
export function retainCreativeAnnotations(metadata: Record<string, any>, previous?: Record<string, any>) {
  const incoming = metadata.bundle?.placementProof;
  const prior = previous?.bundle?.placementProof;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming) ||
    !prior || typeof prior !== "object" || Array.isArray(prior) ||
    typeof incoming.month !== "string" || incoming.month !== prior.month) return;
  for (const key of ["performanceLink", "operation"]) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key) && Object.prototype.hasOwnProperty.call(prior, key)) {
      incoming[key] = prior[key];
    }
  }
}
