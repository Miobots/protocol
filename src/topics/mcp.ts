/** JSON-RPC 2.0 payloads carried inside Miobots envelopes. */

import { isRecord } from "./guards.ts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonRpcId = string | number;
export type JsonRpcParams = JsonObject | JsonValue[];

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: JsonRpcParams;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: JsonValue;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: JsonValue }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: JsonRpcError };

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: JsonRpcParams;
}

export type MCPRequestPayload = JsonRpcRequest;
export type MCPResponsePayload = JsonRpcResponse;
export type MCPNotificationPayload = JsonRpcNotification;

export function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1_024 && value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value !== "object") return false;

  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 1_024 && entries.every(([key, item]) =>
    key !== "__proto__" && key !== "prototype" && key !== "constructor" && isJsonValue(item, depth + 1)
  );
}

function isId(value: unknown): value is JsonRpcId {
  return (typeof value === "string" && value.length > 0) ||
    (typeof value === "number" && Number.isFinite(value));
}

function hasOnlyRpcFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).every((key) => fields.includes(key));
}

function validParams(value: unknown): value is JsonRpcParams {
  return value === undefined || (isJsonValue(value) && typeof value === "object" && value !== null);
}

export function validateMCPRequest(value: unknown): value is MCPRequestPayload {
  if (!isRecord(value) || !hasOnlyRpcFields(value, ["jsonrpc", "id", "method", "params"])) return false;
  return value.jsonrpc === "2.0" && isId(value.id) && typeof value.method === "string" && value.method.length > 0 &&
    validParams(value.params);
}

export function validateMCPResponse(value: unknown): value is MCPResponsePayload {
  if (!isRecord(value) || !hasOnlyRpcFields(value, ["jsonrpc", "id", "result", "error"])) return false;
  const hasResult = Object.prototype.hasOwnProperty.call(value, "result");
  const hasError = Object.prototype.hasOwnProperty.call(value, "error");
  if (value.jsonrpc !== "2.0" || !isId(value.id) || hasResult === hasError) return false;
  if (hasResult) return isJsonValue(value.result);
  if (!isRecord(value.error) || !Number.isInteger(value.error.code) || typeof value.error.message !== "string" ||
    value.error.message.length === 0 || (value.error.data !== undefined && !isJsonValue(value.error.data))) return false;
  return true;
}

export function validateMCPNotification(value: unknown): value is MCPNotificationPayload {
  if (!isRecord(value) || !hasOnlyRpcFields(value, ["jsonrpc", "method", "params"])) return false;
  return value.jsonrpc === "2.0" && typeof value.method === "string" && value.method.length > 0 &&
    validParams(value.params);
}
/**
 * Proof, carried in a `tools/call` request's `params._meta`, that a human approved this exact
 * Action-tier call (BRAIN_DECISIONS 27). Brain attaches it after a tap on the phone; Ganglion runs
 * the action only if the tool and a hash of the exact arguments match, it has not expired, and its
 * id has not been used before. Voice can never produce one.
 */
export interface ApprovalTicket {
  approval_id: string;
  /** Device id of the app connection whose ACK approved it. Who approved comes from the token on that connection. */
  approved_by: string;
  /** The tool's own name on the daemon, e.g. `open_app_or_url`. */
  tool: string;
  /** Hex SHA-256 of `canonicalJson(arguments)`. */
  args_sha256: string;
  /** Unix epoch ms. */
  expires_at: number;
}

export const APPROVAL_META_KEY = "miobots/approval";

/**
 * JSON with object keys sorted at every level, so two sides that built the same arguments in a
 * different order hash the same bytes. Pure on purpose: the app imports this package too, so the
 * hashing itself stays with each consumer.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function isApprovalTicket(value: unknown): value is ApprovalTicket {
  return (
    isRecord(value) &&
    typeof value.approval_id === "string" && value.approval_id.length > 0 &&
    typeof value.approved_by === "string" && value.approved_by.length > 0 &&
    typeof value.tool === "string" && value.tool.length > 0 &&
    typeof value.args_sha256 === "string" && /^[0-9a-f]{64}$/.test(value.args_sha256) &&
    typeof value.expires_at === "number" && Number.isFinite(value.expires_at)
  );
}
