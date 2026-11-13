/** JSON-RPC 2.0 payloads carried inside Miobots envelopes. */

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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