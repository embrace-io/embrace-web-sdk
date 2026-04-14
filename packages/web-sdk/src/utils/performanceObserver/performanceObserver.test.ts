import * as chai from 'chai';
import {
  createPerformanceObserver,
  isEntryTypeSupported,
} from './performanceObserver.ts';

const { expect } = chai;

type ObserverCallback = (list: {
  getEntries: () => PerformanceEntry[];
}) => void;

class MockPerformanceObserver {
  public static supportedEntryTypes: string[] = ['mark', 'measure'];
  public observeOptions: PerformanceObserverInit | null = null;
  public disconnected = false;
  private _callback: ObserverCallback;

  public constructor(callback: ObserverCallback) {
    this._callback = callback;
  }

  public observe(options: PerformanceObserverInit): void {
    this.observeOptions = options;
  }

  public disconnect(): void {
    this.disconnected = true;
  }

  public trigger(entries: PerformanceEntry[]): void {
    this._callback({ getEntries: () => entries });
  }
}

describe('performanceObserver utils', () => {
  let originalPerformanceObserver: typeof globalThis.PerformanceObserver;
  let lastObserverInstance: MockPerformanceObserver | null = null;

  beforeEach(() => {
    originalPerformanceObserver = globalThis.PerformanceObserver;
    lastObserverInstance = null;

    const MockClass = class extends MockPerformanceObserver {
      public constructor(callback: ObserverCallback) {
        super(callback);
        lastObserverInstance = this;
      }
    };
    MockClass.supportedEntryTypes = ['mark', 'measure'];

    (globalThis as Record<string, unknown>)['PerformanceObserver'] = MockClass;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['PerformanceObserver'] =
      originalPerformanceObserver;
  });

  describe('isEntryTypeSupported', () => {
    it('should return true when type is in supportedEntryTypes', () => {
      expect(isEntryTypeSupported('mark')).to.be.true;
      expect(isEntryTypeSupported('measure')).to.be.true;
    });

    it('should return false when type is not in supportedEntryTypes', () => {
      expect(isEntryTypeSupported('long-animation-frame')).to.be.false;
    });

    it('should return false when supportedEntryTypes is empty', () => {
      (
        globalThis.PerformanceObserver as unknown as {
          supportedEntryTypes: string[];
        }
      ).supportedEntryTypes = [];
      expect(isEntryTypeSupported('mark')).to.be.false;
    });

    it('should return false when PerformanceObserver is undefined', () => {
      (globalThis as Record<string, unknown>)['PerformanceObserver'] =
        undefined;
      expect(isEntryTypeSupported('mark')).to.be.false;
    });
  });

  describe('createPerformanceObserver', () => {
    it('should return null when type is unsupported', () => {
      const result = createPerformanceObserver(
        'long-animation-frame',
        () => {},
      );
      expect(result).to.be.null;
    });

    it('should return null when PerformanceObserver is undefined', () => {
      (globalThis as Record<string, unknown>)['PerformanceObserver'] =
        undefined;
      const result = createPerformanceObserver('mark', () => {});
      expect(result).to.be.null;
    });

    it('should return an observer for a supported type', () => {
      const result = createPerformanceObserver('mark', () => {});
      expect(result).to.not.be.null;
    });

    it('should observe with buffered: true by default', () => {
      createPerformanceObserver('mark', () => {});
      expect(lastObserverInstance?.observeOptions).to.deep.equal({
        type: 'mark',
        buffered: true,
      });
    });

    it('should merge caller options with buffered default', () => {
      createPerformanceObserver('mark', () => {}, { buffered: false });
      expect(lastObserverInstance?.observeOptions).to.deep.equal({
        type: 'mark',
        buffered: false,
      });
    });

    it('should invoke processEntry once per entry', () => {
      const received: PerformanceEntry[] = [];
      createPerformanceObserver('mark', (entry) => {
        received.push(entry);
      });

      const a = { name: 'mark-a', entryType: 'mark' } as PerformanceEntry;
      const b = { name: 'mark-b', entryType: 'mark' } as PerformanceEntry;
      lastObserverInstance?.trigger([a, b]);

      expect(received).to.deep.equal([a, b]);
    });

    it('should catch processEntry errors and log them via diag', () => {
      const errors: unknown[] = [];
      const diag = {
        error: (_msg: string, err: unknown) => errors.push(err),
        verbose: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
      };

      createPerformanceObserver(
        'mark',
        () => {
          throw new Error('boom');
        },
        { diag },
      );

      const entry = { name: 'bad', entryType: 'mark' } as PerformanceEntry;
      lastObserverInstance?.trigger([entry]);

      expect(errors).to.have.length(1);
      expect((errors[0] as Error).message).to.equal('boom');
    });

    it('should not throw when processEntry errors and no diag is provided', () => {
      createPerformanceObserver('mark', () => {
        throw new Error('boom');
      });

      const entry = { name: 'bad', entryType: 'mark' } as PerformanceEntry;
      expect(() => lastObserverInstance?.trigger([entry])).to.not.throw();
    });

    it('should return null when the observer constructor throws', () => {
      (globalThis as Record<string, unknown>)['PerformanceObserver'] = class {
        public static supportedEntryTypes = ['mark'];
        public constructor() {
          throw new Error('constructor failed');
        }
      };

      const result = createPerformanceObserver('mark', () => {});
      expect(result).to.be.null;
    });
  });
});
