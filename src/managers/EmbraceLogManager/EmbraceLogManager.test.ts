import { SeverityNumber } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import {
  KEY_EMB_EXCEPTION_HANDLING,
  KEY_EMB_JS_EXCEPTION_STACKTRACE,
  KEY_EMB_TYPE,
} from '../../constants/index.js';
import {
  InMemoryDiagLogger,
  setupTestLogExporter,
  setupTestTraceExporter,
} from '../../testUtils/index.js';
import { OTelPerformanceManager } from '../../utils/index.js';
import type { PerformanceManager } from '../../utils/index.js';
import { EmbraceLogManager } from './EmbraceLogManager.js';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import { EmbraceSpanSessionManager } from '../EmbraceSpanSessionManager/index.js';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import {
  KEY_EMB_ERROR_LOG_COUNT,
  KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT,
} from '../../constants/attributes.js';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.js';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceLogManager', () => {
  let manager: EmbraceLogManager;
  let memoryExporter: InMemoryLogRecordExporter;
  let spanExporter: InMemorySpanExporter;
  let perf: PerformanceManager;
  let spanSessionManager: EmbraceSpanSessionManager;
  let limitManager: EmbraceLimitManager;
  let diag: InMemoryDiagLogger;

  before(() => {
    memoryExporter = setupTestLogExporter();
    spanExporter = setupTestTraceExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    perf = new OTelPerformanceManager();
    diag = new InMemoryDiagLogger();
    limitManager = new EmbraceLimitManager({
      diag,
      ...DEFAULT_LIMITS,
      maxAllowed: {
        ...DEFAULT_LIMITS.maxAllowed,
        error_log: 20,
        warning_log: 4,
      },
      maxLength: {
        ...DEFAULT_LIMITS.maxLength,
        info_log: 60,
        log_attribute_key: 10,
        log_attribute_value: 12,
      },
      maxAttributes: {
        ...DEFAULT_LIMITS.maxAttributes,
        error_log: 2,
      },
    });

    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager,
    });
    manager = new EmbraceLogManager({
      perf,
      spanSessionManager,
      limitManager,
    });
  });

  afterEach(() => {
    memoryExporter.reset();
    spanExporter.reset();
  });

  it('should initialize a EmbraceLogManager', () => {
    expect(manager).to.be.instanceOf(EmbraceLogManager);
  });

  it('should log an info log without stacktrace', () => {
    expect(() => {
      manager.message(
        'this is an info log without stacktrace and one attribute',
        'info',
        {
          attributes: {
            attr_key: 'attr value',
          },
        }
      );
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal(
      'this is an info log without stacktrace and one attribute'
    );
    expect(log.severityNumber).to.be.equal(SeverityNumber.INFO);
    expect(log.severityText).to.be.equal('INFO');

    expect(log.attributes).to.have.property('attr_key', 'attr value');
    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.log');
    expect(log.attributes).to.not.have.property(
      KEY_EMB_JS_EXCEPTION_STACKTRACE
    );
  });

  it('should log a warning log with stacktrace', () => {
    expect(() => {
      manager.message('this is a warning log with stacktrace', 'warning', {
        attributes: {
          attr_key: 'attr value',
        },
      });
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is a warning log with stacktrace');
    expect(log.severityNumber).to.be.equal(SeverityNumber.WARN);
    expect(log.severityText).to.be.equal('WARNING');

    expect(log.attributes).to.have.property('attr_key', 'attr value');
    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.log');
    expect(log.attributes).to.have.property(KEY_EMB_JS_EXCEPTION_STACKTRACE);
  });

  it('should log a warning log without stacktrace', () => {
    expect(() => {
      manager.message('this is a warning log with stacktrace', 'warning', {
        includeStacktrace: false,
      });
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is a warning log with stacktrace');
    expect(log.severityNumber).to.be.equal(SeverityNumber.WARN);
    expect(log.severityText).to.be.equal('WARNING');
    expect(log.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: 'sys.log',
    });
  });

  it('should log a warning log without stacktrace and attributes', () => {
    expect(() => {
      manager.message('this is a warning log with stacktrace', 'warning', {
        attributes: {
          attr_key: 'attr value',
        },
        includeStacktrace: false,
      });
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is a warning log with stacktrace');
    expect(log.severityNumber).to.be.equal(SeverityNumber.WARN);
    expect(log.severityText).to.be.equal('WARNING');
    expect(log.attributes).to.deep.equal({
      [KEY_EMB_TYPE]: 'sys.log',
      attr_key: 'attr value',
    });
  });

  it('should log an error log with stacktrace', () => {
    expect(() => {
      manager.message('this is an error log with stacktrace', 'error', {
        attributes: {
          attr_key: 'attr value',
        },
      });
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is an error log with stacktrace');
    expect(log.severityNumber).to.be.equal(SeverityNumber.ERROR);
    expect(log.severityText).to.be.equal('ERROR');

    expect(log.attributes).to.have.property('attr_key', 'attr value');
    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.log');
    expect(log.attributes).to.have.property(KEY_EMB_JS_EXCEPTION_STACKTRACE);
  });

  it('should log an error log with default options', () => {
    expect(() => {
      manager.message('this is an error log with stacktrace', 'error');
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is an error log with stacktrace');
    expect(log.severityNumber).to.be.equal(SeverityNumber.ERROR);
    expect(log.severityText).to.be.equal('ERROR');

    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.log');
    expect(log.attributes).to.have.property(KEY_EMB_JS_EXCEPTION_STACKTRACE);
    expect(Object.keys(log.attributes)).to.have.lengthOf(2);
  });

  it('should log an exception with stacktrace', () => {
    expect(() => {
      manager.logException(new Error('this is an exception'), {
        attributes: {
          attr_key: 'attr value',
        },
        timestamp: perf.getNowMillis(),
      });
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is an exception');
    expect(log.severityNumber).to.be.equal(SeverityNumber.ERROR);
    expect(log.severityText).to.be.equal('ERROR');

    expect(log.attributes).to.have.property('attr_key', 'attr value');
    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.exception');
    expect(log.attributes).to.have.property(
      KEY_EMB_EXCEPTION_HANDLING,
      'HANDLED'
    );
    expect(log.attributes).to.have.property(ATTR_EXCEPTION_TYPE, 'Error');
    expect(log.attributes).to.have.property('exception.name', 'Error');
    expect(log.attributes).to.have.property(
      ATTR_EXCEPTION_MESSAGE,
      'this is an exception'
    );
    expect(log.attributes).to.have.property(ATTR_EXCEPTION_STACKTRACE);
  });

  it('should log an exception with attributes', () => {
    expect(() => {
      manager.logException(new Error('this is an exception'), {
        attributes: {
          attr_key: 'attr value',
        },
      });
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is an exception');
    expect(log.severityNumber).to.be.equal(SeverityNumber.ERROR);
    expect(log.severityText).to.be.equal('ERROR');

    expect(log.attributes).to.have.property('attr_key', 'attr value');
    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.exception');
    expect(log.attributes).to.have.property(
      KEY_EMB_EXCEPTION_HANDLING,
      'HANDLED'
    );
    expect(log.attributes).to.have.property(ATTR_EXCEPTION_TYPE, 'Error');
    expect(log.attributes).to.have.property('exception.name', 'Error');
    expect(log.attributes).to.have.property(
      ATTR_EXCEPTION_MESSAGE,
      'this is an exception'
    );
    expect(log.attributes).to.have.property(ATTR_EXCEPTION_STACKTRACE);
  });

  it('should log an exception with default options', () => {
    expect(() => {
      manager.logException(new Error('this is an exception'));
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is an exception');
    expect(log.severityNumber).to.be.equal(SeverityNumber.ERROR);
    expect(log.severityText).to.be.equal('ERROR');
    void expect(hrTimeToMilliseconds(log.hrTime)).to.be.lessThanOrEqual(
      perf.getNowMillis()
    );

    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.exception');
    expect(log.attributes).to.have.property(
      KEY_EMB_EXCEPTION_HANDLING,
      'HANDLED'
    );
    expect(log.attributes).to.have.property(ATTR_EXCEPTION_TYPE, 'Error');
    expect(log.attributes).to.have.property('exception.name', 'Error');
    expect(log.attributes).to.have.property(
      ATTR_EXCEPTION_MESSAGE,
      'this is an exception'
    );
    expect(log.attributes).to.have.property(ATTR_EXCEPTION_STACKTRACE);
  });

  it('should allow logging an exception has unhandled', () => {
    expect(() => {
      manager.logException(new Error('this is an exception'), {
        handled: false,
      });
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is an exception');
    expect(log.severityNumber).to.be.equal(SeverityNumber.ERROR);
    expect(log.severityText).to.be.equal('ERROR');
    void expect(hrTimeToMilliseconds(log.hrTime)).to.be.lessThanOrEqual(
      perf.getNowMillis()
    );

    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.exception');
    expect(log.attributes).to.have.property(
      KEY_EMB_EXCEPTION_HANDLING,
      'UNHANDLED'
    );
    expect(log.attributes).to.have.property(ATTR_EXCEPTION_TYPE, 'Error');
    expect(log.attributes).to.have.property('exception.name', 'Error');
  });

  it('should report counts of logging on the active session span', () => {
    spanSessionManager.startSessionSpan();

    // Error logs should be counted
    manager.message('this is an error log', 'error');
    manager.message('this is another error log', 'error');

    // Other severities should not
    manager.message('this is a warning log', 'warning');
    manager.message('this is an info log', 'info');

    // Unhandled exceptions should be counted
    manager.logException(new Error('this is an exception'), { handled: false });
    manager.logException(new Error('this is another exception'), {
      handled: false,
    });
    manager.logException(new Error('this is a third exception'), {
      handled: false,
    });

    // Handled exceptions should not
    manager.logException(new Error('this is a handled exception'), {
      handled: true,
    });

    spanSessionManager.endSessionSpan();
    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes[KEY_EMB_ERROR_LOG_COUNT]).to.be.equal(2);
    expect(
      sessionSpan.attributes[KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT]
    ).to.be.equal(3);
  });

  it('should handle report counts of logging when there is no the active session span', () => {
    expect(() => {
      manager.message('this is an error log', 'error');
      manager.logException(new Error('this is an exception'), {
        handled: false,
      });
    }).to.not.throw();

    spanSessionManager.startSessionSpan();
    spanSessionManager.endSessionSpan();

    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(sessionSpan.attributes).not.to.have.property(
      KEY_EMB_ERROR_LOG_COUNT
    );
    expect(sessionSpan.attributes).not.to.have.property(
      KEY_EMB_UNHANDLED_EXCEPTIONS_COUNT
    );
  });

  it('should limit the amount of logs per severity per session', () => {
    spanSessionManager.startSessionSpan();

    for (let i = 0; i < 10; i++) {
      manager.message('this is a warning log', 'warning');
    }

    for (let i = 0; i < 10; i++) {
      manager.message('this is an error log', 'error');
    }

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(14);

    // The warning logs should be limited
    for (let i = 0; i < 4; i++) {
      expect(finishedLogs[i].body).to.equal('this is a warning log');
    }

    // All the error logs should be available
    for (let i = 4; i < 14; i++) {
      expect(finishedLogs[i].body).to.equal('this is an error log');
    }

    spanSessionManager.endSessionSpan();
    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(
      sessionSpan.attributes['emb.app.applied_limit.warning_log.drop.count']
    ).to.be.equal(6);
    expect(sessionSpan.attributes).not.to.have.property(
      'emb.app.applied_limit.error_log.drop.count'
    );

    const warningLogs = diag.getWarnLogs();
    expect(warningLogs).to.have.lengthOf(6);
    for (let i = 0; i < warningLogs.length; i++) {
      expect(warningLogs[i]).to.equal(
        'disallowing warning_log because the maximum number of 4 has already been reached for this session'
      );
    }

    // A new session should reset the limit
    memoryExporter.reset();
    spanSessionManager.startSessionSpan();
    manager.message('this is a warning log', 'warning');
    const nextSessionFinishedLogs = memoryExporter.getFinishedLogRecords();
    expect(nextSessionFinishedLogs).to.have.lengthOf(1);
    expect(nextSessionFinishedLogs[0].body).to.equal('this is a warning log');
  });

  it('should truncate log messages', () => {
    spanSessionManager.startSessionSpan();

    manager.message('this is an info log', 'info');
    manager.message(
      'this is an info log which has a message longer than the allowed maximum length',
      'info'
    );

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(2);
    expect(finishedLogs[0].body).to.equal('this is an info log');
    expect(finishedLogs[1].body).to.equal(
      'this is an info log which has a message longer than the allo'
    );

    spanSessionManager.endSessionSpan();
    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.info_log.truncate_string.count'
      ]
    ).to.be.equal(1);

    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.equal(
      'truncating info_log because it is longer than 60 characters: "this is an info log which has a message longer than the allowed maximum length"'
    );
  });

  it('should truncate the number of log attributes', () => {
    spanSessionManager.startSessionSpan();

    manager.message('this is an error log', 'error', {
      attributes: {
        key1: '1',
        key2: '2',
      },
    });

    manager.message('this is an error log with truncated attributes', 'error', {
      attributes: {
        key1: '1',
        key2: '2',
        key3: '3',
      },
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(2);
    expect(finishedLogs[0].body).to.equal('this is an error log');
    expect(finishedLogs[1].body).to.equal(
      'this is an error log with truncated attributes'
    );

    expect(finishedLogs[0].attributes['key1']).to.be.equal('1');
    expect(finishedLogs[0].attributes['key2']).to.be.equal('2');

    expect(finishedLogs[1].attributes['key1']).to.be.equal('1');
    expect(finishedLogs[1].attributes['key2']).to.be.equal('2');
    // Seems to be deterministic that this is always the one to be removed, adding sorting if the test becomes flaky
    expect(finishedLogs[1].attributes).not.to.have.property('key3');

    spanSessionManager.endSessionSpan();
    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.error_log.truncate_attributes.count'
      ]
    ).to.be.equal(1);

    expect(diag.getWarnLogs()).to.have.lengthOf(1);
    expect(diag.getWarnLogs()[0]).to.equal(
      'truncating error_log attributes because there are more than 2 set'
    );
  });

  it('should truncate the key and value of a log attribute', () => {
    spanSessionManager.startSessionSpan();

    manager.message('this is an error log', 'error', {
      attributes: {
        'a-very-long-log-attribute-key': 'a-very-long-log-attribute-value',
      },
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    expect(finishedLogs[0].body).to.equal('this is an error log');

    expect(finishedLogs[0].attributes['a-very-lon']).to.be.equal(
      'a-very-long-'
    );

    spanSessionManager.endSessionSpan();
    const finishedSpans = spanExporter.getFinishedSpans();
    expect(finishedSpans).to.have.lengthOf(1);
    const sessionSpan = finishedSpans[0];
    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.log_attribute_key.truncate_string.count'
      ]
    ).to.be.equal(1);
    expect(
      sessionSpan.attributes[
        'emb.app.applied_limit.log_attribute_value.truncate_string.count'
      ]
    ).to.be.equal(1);

    expect(diag.getWarnLogs()).to.have.lengthOf(2);
    expect(diag.getWarnLogs()[0]).to.equal(
      'truncating log_attribute_key because it is longer than 10 characters: "a-very-long-log-attribute-key"'
    );
    expect(diag.getWarnLogs()[1]).to.equal(
      'truncating log_attribute_value because it is longer than 12 characters: "a-very-long-log-attribute-value"'
    );
  });
});
