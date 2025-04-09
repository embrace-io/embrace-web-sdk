import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { setupTestLogExporter } from '../../testUtils/index.js';
import { EmbraceLogManager } from './EmbraceLogManager.js';
import {
  OTelPerformanceManager,
  type PerformanceManager,
} from '../../utils/index.js';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import {
  KEY_EMB_JS_EXCEPTION_STACKTRACE,
  KEY_EMB_TYPE,
} from '../../constants/index.js';
import { SeverityNumber } from '@opentelemetry/api-logs';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceLogManager', () => {
  let manager: EmbraceLogManager;
  let memoryExporter: InMemoryLogRecordExporter;
  let perf: PerformanceManager;

  before(() => {
    memoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    memoryExporter.reset();
    perf = new OTelPerformanceManager();
    manager = new EmbraceLogManager({ perf });
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
          attr_key: 'attr value',
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
        attr_key: 'attr value',
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
      manager.message(
        'this is a warning log with stacktrace',
        'warning',
        {
          attr_key: 'attr value',
        },
        false
      );
    }).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.body).to.equal('this is a warning log with stacktrace');
    expect(log.severityNumber).to.be.equal(SeverityNumber.WARN);
    expect(log.severityText).to.be.equal('WARNING');

    expect(log.attributes).to.have.property('attr_key', 'attr value');
    expect(log.attributes).to.have.property(KEY_EMB_TYPE, 'sys.log');
    expect(log.attributes).to.not.have.property(
      KEY_EMB_JS_EXCEPTION_STACKTRACE
    );
  });

  it('should log an error log with stacktrace', () => {
    expect(() => {
      manager.message('this is an error log with stacktrace', 'error', {
        attr_key: 'attr value',
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
});
