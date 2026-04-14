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

    it('should invoke callback with entries from the observer list', () => {
      const received: PerformanceEntry[][] = [];
      createPerformanceObserver('mark', (entries) => {
        received.push(entries);
      });

      const entry = { name: 'my-mark', entryType: 'mark' } as PerformanceEntry;
      lastObserverInstance?.trigger([entry]);

      expect(received).to.have.length(1);
      expect(received[0]).to.deep.equal([entry]);
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
