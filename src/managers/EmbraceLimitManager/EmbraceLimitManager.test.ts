import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { InMemoryDiagLogger } from '../../../tests/utils/index.ts';
import { EMB_TYPES, KEY_EMB_TYPE } from '../../constants/index.ts';
import { DEFAULT_LIMITS } from './constants.ts';
import { EmbraceLimitManager } from './EmbraceLimitManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceLimitManager', () => {
  let limitManager: EmbraceLimitManager;
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    limitManager = new EmbraceLimitManager({
      diag,
      ...DEFAULT_LIMITS,
      maxAllowed: {
        ...DEFAULT_LIMITS.maxAllowed,
        breadcrumb: 3,
        exception: 2,
        error_log: 2,
        warning_log: 2,
        info_log: 2,
        session_property: 2,
        span: 3,
        network_request: 3,
      },
      maxLength: {
        ...DEFAULT_LIMITS.maxLength,
        breadcrumb: 10,
        exception: 15,
        error_log: 20,
        warning_log: 20,
        info_log: 20,
        session_property_key: 8,
        session_property_value: 10,
        log_attribute_key: 6,
        log_attribute_value: 8,
        exception_attribute_key: 6,
        exception_attribute_value: 8,
      },
      maxAttributes: {
        ...DEFAULT_LIMITS.maxAttributes,
        exception: 2,
        error_log: 2,
        warning_log: 2,
        info_log: 2,
      },
    });
  });

  describe('truncateString', () => {
    it('should return string unchanged when under max length', () => {
      const result = limitManager.truncateString('breadcrumb', 'short');
      expect(result).to.equal('short');
      expect(diag.getWarnLogs()).to.have.lengthOf(0);
    });

    it('should return string unchanged when exactly at max length', () => {
      const result = limitManager.truncateString('breadcrumb', '1234567890');
      expect(result).to.equal('1234567890');
      expect(diag.getWarnLogs()).to.have.lengthOf(0);
    });

    it('should truncate string when over max length', () => {
      const result = limitManager.truncateString(
        'breadcrumb',
        '12345678901234',
      );
      expect(result).to.equal('1234567890');
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
      expect(diag.getWarnLogs()[0]).to.contain('truncating breadcrumb');
    });

    it('should increment diagnostic count when truncating', () => {
      limitManager.truncateString('breadcrumb', '12345678901234');
      const counts = limitManager.getDiagnosticCounts();
      expect(
        counts['emb.app.applied_limit.breadcrumb.truncate_string.count'],
      ).to.equal(1);
    });
  });

  describe('limitBreadcrumb', () => {
    it('should return limited breadcrumb with truncated name', () => {
      const result = limitManager.limitBreadcrumb('short');
      expect(result).to.deep.equal({ name: 'short' });
    });

    it('should truncate name when too long', () => {
      const result = limitManager.limitBreadcrumb('this is a very long name');
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.name).to.equal('this is a ');
      }
    });

    it('should drop breadcrumb when max count reached', () => {
      limitManager.limitBreadcrumb('one');
      limitManager.limitBreadcrumb('two');
      limitManager.limitBreadcrumb('three');
      const result = limitManager.limitBreadcrumb('four');
      expect(result).to.equal('dropped');
      expect(diag.getWarnLogs()).to.include(
        'disallowing breadcrumb because the maximum number of 3 has already been reached for this session',
      );
    });

    it('should increment diagnostic drop count when max reached', () => {
      limitManager.limitBreadcrumb('one');
      limitManager.limitBreadcrumb('two');
      limitManager.limitBreadcrumb('three');
      limitManager.limitBreadcrumb('four');
      const counts = limitManager.getDiagnosticCounts();
      expect(counts['emb.app.applied_limit.breadcrumb.drop.count']).to.equal(1);
    });
  });

  describe('limitException', () => {
    it('should return limited exception with message and attributes', () => {
      const result = limitManager.limitException('error msg', { key: 'value' });
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.message).to.equal('error msg');
        expect(result.attributes).to.deep.equal({ key: 'value' });
      }
    });

    it('should truncate message when too long', () => {
      const result = limitManager.limitException(
        'this exception message is too long',
        {},
      );
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        // 15 characters is the max length for exception message in this test
        expect(result.message).to.have.lengthOf(15);
        expect(result.message).to.equal('this exception ');
      }
    });

    it('should truncate attribute count when exceeded', () => {
      const result = limitManager.limitException('msg', {
        key1: 'val1',
        key2: 'val2',
        key3: 'val3',
      });
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(Object.keys(result.attributes)).to.have.lengthOf(2);
      }
    });

    it('should truncate attribute key and value length', () => {
      const result = limitManager.limitException('msg', {
        longKeyName: 'longValueName',
      });
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.attributes).to.have.property('longKe', 'longValu');
      }
    });

    it('should drop exception when max count reached', () => {
      limitManager.limitException('one', {});
      limitManager.limitException('two', {});
      const result = limitManager.limitException('three', {});
      expect(result).to.equal('dropped');
    });
  });

  describe('limitLog', () => {
    it('should return limited log for info severity', () => {
      const result = limitManager.limitLog('info message', 'info', {
        key: 'val',
      });
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.message).to.equal('info message');
        expect(result.attributes).to.deep.equal({ key: 'val' });
      }
    });

    it('should return limited log for warning severity', () => {
      const result = limitManager.limitLog('warn message', 'warning', {});
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.message).to.equal('warn message');
      }
    });

    it('should return limited log for error severity', () => {
      const result = limitManager.limitLog('error message', 'error', {});
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.message).to.equal('error message');
      }
    });

    it('should truncate message when too long', () => {
      const result = limitManager.limitLog(
        'this is a very long info message that exceeds limit',
        'info',
        {},
      );
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.message).to.equal('this is a very long ');
      }
    });

    it('should truncate attribute count when exceeded', () => {
      const result = limitManager.limitLog('msg', 'error', {
        key1: 'val1',
        key2: 'val2',
        key3: 'val3',
      });
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(Object.keys(result.attributes)).to.have.lengthOf(2);
      }
    });

    it('should drop log when max count reached for severity', () => {
      limitManager.limitLog('one', 'info', {});
      limitManager.limitLog('two', 'info', {});
      const result = limitManager.limitLog('three', 'info', {});
      expect(result).to.equal('dropped');
    });

    it('should track limits separately for each severity', () => {
      limitManager.limitLog('info1', 'info', {});
      limitManager.limitLog('info2', 'info', {});
      limitManager.limitLog('warn1', 'warning', {});

      // Info should be at limit
      const infoResult = limitManager.limitLog('info3', 'info', {});
      expect(infoResult).to.equal('dropped');

      // Warning should still be allowed
      const warnResult = limitManager.limitLog('warn2', 'warning', {});
      expect(warnResult).to.not.equal('dropped');
    });
  });

  describe('limitSessionProperty', () => {
    it('should return limited session property', () => {
      const result = limitManager.limitSessionProperty('key', 'value');
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.key).to.equal('key');
        expect(result.value).to.equal('value');
      }
    });

    it('should truncate key when too long', () => {
      const result = limitManager.limitSessionProperty('verylongkey', 'value');
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.key).to.equal('verylong');
      }
    });

    it('should truncate value when too long', () => {
      const result = limitManager.limitSessionProperty('key', 'verylongvalue');
      expect(result).to.not.equal('dropped');
      if (result !== 'dropped') {
        expect(result.value).to.equal('verylongva');
      }
    });

    it('should drop session property when max count reached', () => {
      limitManager.limitSessionProperty('k1', 'v1');
      limitManager.limitSessionProperty('k2', 'v2');
      const result = limitManager.limitSessionProperty('k3', 'v3');
      expect(result).to.equal('dropped');
    });
  });

  describe('dropReadableSpan', () => {
    const createMockSpan = (embType?: string): ReadableSpan =>
      ({
        attributes: embType ? { [KEY_EMB_TYPE]: embType } : {},
      }) as ReadableSpan;

    it('should not drop span when under limit', () => {
      const result = limitManager.dropReadableSpan(createMockSpan());
      expect(result).to.be.false;
    });

    it('should drop regular span when max reached', () => {
      limitManager.dropReadableSpan(createMockSpan());
      limitManager.dropReadableSpan(createMockSpan());
      limitManager.dropReadableSpan(createMockSpan());
      const result = limitManager.dropReadableSpan(createMockSpan());
      expect(result).to.be.true;
    });

    it('should detect network spans separately', () => {
      // Fill up regular span limit
      limitManager.dropReadableSpan(createMockSpan());
      limitManager.dropReadableSpan(createMockSpan());
      limitManager.dropReadableSpan(createMockSpan());

      // Network spans should still be allowed (separate limit)
      const networkResult = limitManager.dropReadableSpan(
        createMockSpan(EMB_TYPES.Network),
      );
      expect(networkResult).to.be.false;
    });

    it('should drop network span when network limit reached', () => {
      limitManager.dropReadableSpan(createMockSpan(EMB_TYPES.Network));
      limitManager.dropReadableSpan(createMockSpan(EMB_TYPES.Network));
      limitManager.dropReadableSpan(createMockSpan(EMB_TYPES.Network));
      const result = limitManager.dropReadableSpan(
        createMockSpan(EMB_TYPES.Network),
      );
      expect(result).to.be.true;
    });

    it('should track network and regular spans independently', () => {
      // Use up all regular spans
      limitManager.dropReadableSpan(createMockSpan());
      limitManager.dropReadableSpan(createMockSpan());
      limitManager.dropReadableSpan(createMockSpan());
      expect(limitManager.dropReadableSpan(createMockSpan())).to.be.true;

      // Network spans should still be available
      expect(limitManager.dropReadableSpan(createMockSpan(EMB_TYPES.Network)))
        .to.be.false;
    });
  });

  describe('reset', () => {
    it('should reset all counters', () => {
      limitManager.limitBreadcrumb('one');
      limitManager.limitBreadcrumb('two');
      limitManager.limitBreadcrumb('three');

      // Should be at limit
      expect(limitManager.limitBreadcrumb('four')).to.equal('dropped');

      limitManager.reset();

      // Should allow breadcrumbs again
      expect(limitManager.limitBreadcrumb('five')).to.not.equal('dropped');
    });

    it('should reset diagnostic counts', () => {
      limitManager.truncateString('breadcrumb', 'this is too long');
      expect(
        limitManager.getDiagnosticCounts()[
          'emb.app.applied_limit.breadcrumb.truncate_string.count'
        ],
      ).to.equal(1);

      limitManager.reset();
      expect(limitManager.getDiagnosticCounts()).to.deep.equal({});
    });

    it('should reset all limit types', () => {
      limitManager.limitBreadcrumb('one');
      limitManager.limitBreadcrumb('two');
      limitManager.limitBreadcrumb('three');
      limitManager.limitException('one', {});
      limitManager.limitException('two', {});
      limitManager.limitLog('one', 'info', {});
      limitManager.limitLog('two', 'info', {});

      limitManager.reset();

      // All types should be reset
      expect(limitManager.limitBreadcrumb('test')).to.not.equal('dropped');
      expect(limitManager.limitException('test', {})).to.not.equal('dropped');
      expect(limitManager.limitLog('test', 'info', {})).to.not.equal('dropped');
    });
  });

  describe('getDiagnosticCounts', () => {
    it('should return empty object initially', () => {
      expect(limitManager.getDiagnosticCounts()).to.deep.equal({});
    });

    it('should track truncate_string operations', () => {
      limitManager.truncateString('breadcrumb', 'this is too long');
      limitManager.truncateString('breadcrumb', 'another long one');
      const counts = limitManager.getDiagnosticCounts();
      expect(
        counts['emb.app.applied_limit.breadcrumb.truncate_string.count'],
      ).to.equal(2);
    });

    it('should track drop operations', () => {
      limitManager.limitBreadcrumb('one');
      limitManager.limitBreadcrumb('two');
      limitManager.limitBreadcrumb('three');
      limitManager.limitBreadcrumb('four');
      limitManager.limitBreadcrumb('five');
      const counts = limitManager.getDiagnosticCounts();
      expect(counts['emb.app.applied_limit.breadcrumb.drop.count']).to.equal(2);
    });

    it('should track truncate_attributes operations', () => {
      limitManager.limitException('msg', {
        key1: 'val1',
        key2: 'val2',
        key3: 'val3',
      });
      const counts = limitManager.getDiagnosticCounts();
      expect(
        counts['emb.app.applied_limit.exception.truncate_attributes.count'],
      ).to.equal(1);
    });

    it('should track multiple operation types', () => {
      limitManager.truncateString('breadcrumb', 'this is too long');
      limitManager.limitBreadcrumb('one');
      limitManager.limitBreadcrumb('two');
      limitManager.limitBreadcrumb('three');
      limitManager.limitBreadcrumb('four');

      const counts = limitManager.getDiagnosticCounts();
      expect(
        counts['emb.app.applied_limit.breadcrumb.truncate_string.count'],
      ).to.equal(1);
      expect(counts['emb.app.applied_limit.breadcrumb.drop.count']).to.equal(1);
    });
  });

  describe('constructor', () => {
    it('should use default diag logger when not provided', () => {
      const manager = new EmbraceLimitManager({
        ...DEFAULT_LIMITS,
      });
      // Should not throw and work normally
      expect(manager.limitBreadcrumb('test')).to.not.equal('dropped');
    });

    it('should use provided diag logger', () => {
      limitManager.truncateString('breadcrumb', 'this is too long for limit');
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
    });
  });
});
