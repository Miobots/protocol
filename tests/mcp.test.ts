import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  ProtocolDefaults,
  Topics,
  SequenceCounter,
  decode,
  encode,
  newEnvelope,
  type MCPNotificationPayload,
  type MCPRequestPayload,
  type MCPResponsePayload,
} from '../src/index.ts';

const seq = () => new SequenceCounter();

function envelope(topic: typeof Topics.MCP_REQUEST, payload: MCPRequestPayload) {
  return newEnvelope({ kind: Kind.CMD, topic, payload, seq: seq() });
}

describe('MCP JSON-RPC protocol contracts', () => {
  it('round-trips valid requests, responses, errors, notifications, and optional params', () => {
    const request = envelope(Topics.MCP_REQUEST, {
      jsonrpc: '2.0', id: 'req-1', method: 'tools/list', params: { cursor: null },
    });
    assert.deepEqual(decode(encode(request)).payload, request.payload);

    const response = newEnvelope<typeof Topics.MCP_RESPONSE, MCPResponsePayload>({
      kind: Kind.EVT,
      topic: Topics.MCP_RESPONSE,
      payload: { jsonrpc: '2.0', id: 2, result: { tools: [] } },
      seq: seq(),
    });
    assert.deepEqual(decode<typeof Topics.MCP_RESPONSE, MCPResponsePayload>(encode(response)).payload, response.payload);

    const errorResponse = newEnvelope({
      kind: Kind.EVT,
      topic: Topics.MCP_RESPONSE,
      payload: { jsonrpc: '2.0', id: 'req-2', error: { code: -32601, message: 'Method not found', data: null } },
      seq: seq(),
    });
    assert.deepEqual(decode<typeof Topics.MCP_RESPONSE, MCPResponsePayload>(encode(errorResponse)).payload, errorResponse.payload);

    const notification: MCPNotificationPayload = { jsonrpc: '2.0', method: 'notifications/initialized' };
    const notificationEnvelope = newEnvelope({
      kind: Kind.EVT,
      topic: Topics.MCP_NOTIFICATION,
      payload: notification,
      seq: seq(),
    });
    assert.equal(decode<typeof Topics.MCP_NOTIFICATION, MCPNotificationPayload>(encode(notificationEnvelope)).payload.method, 'notifications/initialized');
  });

  it('rejects malformed JSON-RPC payloads before dispatch', () => {
    const invalidPayloads = [
      { jsonrpc: '1.0', id: 'x', method: 'tools/list' },
      { jsonrpc: '2.0', id: 'x' },
      { jsonrpc: '2.0', id: 'x', method: '' },
      { jsonrpc: '2.0', id: null, method: 'tools/list' },
      { jsonrpc: '2.0', id: true, method: 'tools/list' },
      { jsonrpc: '2.0', id: Number.POSITIVE_INFINITY, method: 'tools/list' },
      { jsonrpc: '2.0', id: 'x', method: 'tools/list', params: 'wrong' },
    ];

    for (const payload of invalidPayloads) {
      assert.throws(() => decode(encode(envelope(Topics.MCP_REQUEST, payload as MCPRequestPayload))));
    }
  });

  it('rejects invalid responses and notifications', () => {
    const invalidResponses = [
      { jsonrpc: '2.0', id: 'x', result: {}, error: { code: 1, message: 'nope' } },
      { jsonrpc: '2.0', id: 'x' },
      { jsonrpc: '2.0', id: 'x', error: { code: 1, message: '' } },
      { jsonrpc: '2.0', id: 'x', error: { code: 1.5, message: 'bad code' } },
    ];
    for (const payload of invalidResponses) {
      const response = newEnvelope({
        kind: Kind.EVT,
        topic: Topics.MCP_RESPONSE,
        payload: payload as unknown as MCPResponsePayload,
        seq: seq(),
      });
      assert.throws(() => decode(encode(response)));
    }

    const notification = newEnvelope({
      kind: Kind.EVT,
      topic: Topics.MCP_NOTIFICATION,
      payload: { jsonrpc: '2.0', id: 'forbidden', method: 'notifications/progress' } as unknown as MCPNotificationPayload,
      seq: seq(),
    });
    assert.throws(() => decode(encode(notification)));
  });

  it('rejects dangerous nesting, oversized collections, prototype keys, and oversized envelopes', () => {
    let nested: unknown = null;
    for (let i = 0; i < 33; i++) nested = { value: nested };
    const deepRequest = envelope(Topics.MCP_REQUEST, {
      jsonrpc: '2.0', id: 'deep', method: 'tools/call', params: nested as Record<string, never>,
    });
    assert.throws(() => decode(encode(deepRequest)));

    const collection = Array.from({ length: 1_025 }, () => null);
    const largeCollection = envelope(Topics.MCP_REQUEST, {
      jsonrpc: '2.0', id: 'many', method: 'tools/call', params: collection,
    });
    assert.throws(() => decode(encode(largeCollection)));

    const prototypeKey = envelope(Topics.MCP_REQUEST, {
      jsonrpc: '2.0', id: 'proto', method: 'tools/call', params: { constructor: null },
    });
    assert.throws(() => decode(encode(prototypeKey)));

    const oversized = JSON.stringify({
      ...newEnvelope({ kind: Kind.EVT, topic: Topics.MCP_NOTIFICATION, payload: { jsonrpc: '2.0', method: 'x' }, seq: seq() }),
      payload: { jsonrpc: '2.0', method: 'x', params: { text: 'x'.repeat(ProtocolDefaults.MAX_MESSAGE_BYTES) } },
    });
    assert.ok(new TextEncoder().encode(oversized).byteLength > ProtocolDefaults.MAX_MESSAGE_BYTES);
    assert.throws(() => decode(oversized));
  });

  it('rejects invalid kind/topic combinations while preserving existing envelopes', () => {
    const invalid = newEnvelope({
      kind: Kind.CMD,
      topic: Topics.MCP_RESPONSE,
      payload: { jsonrpc: '2.0', id: 'x', result: null },
      seq: seq(),
    });
    assert.throws(() => decode(encode(invalid)));

    const existing = newEnvelope({
      kind: Kind.CMD,
      topic: Topics.VOICE_SPEAK,
      payload: { text: 'hello', lang: 'en' },
      seq: seq(),
    });
    assert.equal(decode(encode(existing)).topic, Topics.VOICE_SPEAK);
  });
});