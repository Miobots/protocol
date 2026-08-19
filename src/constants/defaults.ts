/**
 * Protocol Defaults and Network Configuration Constants.
 */

export const ProtocolDefaults = {
  // Protocol Version
  PROTOCOL_VERSION: 1,

  // Network & WebSocket Endpoints
  DEFAULT_PORT: 8080,
  DEFAULT_WS_PATH: '/ws',
  DEFAULT_BRAIN_URL: 'ws://localhost:8080/ws',
  DEFAULT_DEV_TOKEN: 'mio-dev-secret-token',
  DEFAULT_FAKE_HEART_ID: 'heart-sim-01',

  // Reconnection Backoff & Jitter Configuration
  RECONNECT_INITIAL_DELAY_MS: 1000,
  RECONNECT_MAX_DELAY_MS: 10000,
  RECONNECT_BACKOFF_MULTIPLIER: 1.5,
  RECONNECT_JITTER_MIN_FACTOR: 0.5,
  RECONNECT_JITTER_MAX_FACTOR: 1.5,

  // Heartbeat & Liveness Timing (§8)
  HEARTBEAT_INTERVAL_MS: 5000,
  HEARTBEAT_MISSED_THRESHOLD: 3,
  HEARTBEAT_TIMEOUT_MS: 15000,

  // Command & Request Timeouts
  DEFAULT_COMMAND_TIMEOUT_MS: 5000,
  DEFAULT_APPROVAL_TIMEOUT_MS: 60000,

  // Payload & Message Size Constraints (64 KB)
  MAX_PAYLOAD_BYTES: 65536,
  MAX_MESSAGE_BYTES: 65536,

  // ULID Configuration
  ULID_TIME_LEN: 10,
  ULID_RANDOM_LEN: 16,
  ULID_TOTAL_LEN: 26,
  CROCKFORD_BASE32_ALPHABET: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
} as const;
