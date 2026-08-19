import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parse,
  decode,
  validateEnvelope,
  type Envelope,
} from '../src/index.ts';

interface ConformanceVector {
  description?: string;
  envelope?: Record<string, unknown>;
  raw?: string;
  expect: {
    parses: boolean;
    reason?: string;
    field?: string;
  };
}

const CONFORMANCE_DIR = join(import.meta.dirname, '..', 'conformance');
const VALID_DIR = join(CONFORMANCE_DIR, 'valid');
const INVALID_DIR = join(CONFORMANCE_DIR, 'invalid');

describe('Protocol Conformance Vectors (Cross-Language Parity)', () => {
  describe('Valid Vectors (conformance/valid/)', () => {
    const validFiles = readdirSync(VALID_DIR).filter((f) => f.endsWith('.json'));

    it('finds at least 10 canonical valid vectors', () => {
      assert.ok(validFiles.length >= 10, `Expected at least 10 valid vectors, found ${validFiles.length}`);
    });

    for (const file of validFiles) {
      const fullPath = join(VALID_DIR, file);
      const content = readFileSync(fullPath, 'utf-8');
      const vector: ConformanceVector = JSON.parse(content);

      it(`correctly parses valid vector [${file}] - ${vector.description ?? 'valid envelope'}`, () => {
        assert.equal(vector.expect.parses, true, `Vector ${file} expect.parses must be true`);
        assert.ok(vector.envelope, `Vector ${file} must supply an envelope object`);

        const rawWire = vector.raw ?? JSON.stringify(vector.envelope);

        // 1. Test parse() safe wrapper
        const parseResult = parse(rawWire);
        assert.equal(parseResult.success, true, `parse() failed for valid vector ${file}`);

        if (parseResult.success) {
          assert.deepEqual(
            parseResult.data,
            vector.envelope as unknown as Envelope,
            `Decoded data does not match vector envelope in ${file}`
          );
        }

        // 2. Test validateEnvelope() directly
        const validated = validateEnvelope(vector.envelope);
        assert.deepEqual(validated, vector.envelope as unknown as Envelope);

        // 3. Test decode() directly
        const decoded = decode(rawWire);
        assert.deepEqual(decoded, vector.envelope as unknown as Envelope);
      });
    }
  });

  describe('Invalid Vectors (conformance/invalid/)', () => {
    const invalidFiles = readdirSync(INVALID_DIR).filter((f) => f.endsWith('.json'));

    it('finds at least 10 canonical invalid vectors', () => {
      assert.ok(invalidFiles.length >= 10, `Expected at least 10 invalid vectors, found ${invalidFiles.length}`);
    });

    for (const file of invalidFiles) {
      const fullPath = join(INVALID_DIR, file);
      const content = readFileSync(fullPath, 'utf-8');
      const vector: ConformanceVector = JSON.parse(content);

      it(`rejects invalid vector [${file}] - ${vector.description ?? 'invalid envelope'}`, () => {
        assert.equal(vector.expect.parses, false, `Vector ${file} expect.parses must be false`);

        const rawWire = vector.raw ?? JSON.stringify(vector.envelope);

        // Test parse() returns error
        const parseResult = parse(rawWire);
        assert.equal(
          parseResult.success,
          false,
          `Expected parse() to fail for invalid vector ${file}, but it succeeded`
        );

        if (!parseResult.success) {
          if (vector.expect.reason) {
            assert.equal(
              parseResult.error.reason,
              vector.expect.reason,
              `Vector ${file}: expected error reason "${vector.expect.reason}", got "${parseResult.error.reason}" (${parseResult.error.message})`
            );
          }

          if (vector.expect.field) {
            assert.equal(
              parseResult.error.field,
              vector.expect.field,
              `Vector ${file}: expected error field "${vector.expect.field}", got "${parseResult.error.field}" (${parseResult.error.message})`
            );
          }
        }

        // Also test decode() throws ProtocolError
        assert.throws(
          () => decode(rawWire),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            return true;
          }
        );
      });
    }
  });
});
