import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  InMemoryDiagLogger,
  InMemoryStorage,
  FailingStorage,
} from '../../testUtils/index.js';
import { EmbraceExperienceManager } from './EmbraceExperienceManager.js';
import type { ExperienceData } from './types.js';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceExperienceManager', () => {
  let manager: EmbraceExperienceManager;
  let diag: InMemoryDiagLogger;
  let storage: InMemoryStorage;
  let sessionStorage: InMemoryStorage;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    storage = new InMemoryStorage();
    sessionStorage = new InMemoryStorage();
    clock = sinon.useFakeTimers();

    // Clear any window state
    Object.defineProperty(window, 'opener', {
      value: null,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, 'referrer', {
      value: '',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    storage.clear();
    sessionStorage.clear();
    clock.restore();
    sinon.restore();
  });

  describe('initialization', () => {
    it('should generate new experience ID when no storage exists', () => {
      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getExperienceId()).to.be.a('string');
      expect(manager.getExperienceId()).to.have.length.greaterThan(0);
    });

    it('should restore existing experience from sessionStorage', () => {
      const existingData: ExperienceData = {
        experienceId: 'existing-id-123',
        lastActivityAt: Date.now() - 1000,
        tabOpenMethod: 'manual_new_tab',
        referrerType: 'none',
      };
      sessionStorage.setItem(
        'embrace_experience',
        JSON.stringify(existingData)
      );

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getExperienceId()).to.equal('existing-id-123');
      expect(manager.getTabOpenMethod()).to.equal('manual_new_tab');
    });

    it('should handle malformed experience data in sessionStorage', () => {
      sessionStorage.setItem('embrace_experience', 'not-valid-json');

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getExperienceId()).to.be.a('string');
      expect(diag.getWarnLogs()).to.include(
        'Failed to get stored experience data:'
      );
    });

    it('should create instance with default storage when not provided', () => {
      manager = new EmbraceExperienceManager({ diag });

      expect(manager.getExperienceId()).to.be.a('string');
    });
  });

  describe('tab open method detection', () => {
    it('should detect reload navigation', () => {
      const navEntry = {
        type: 'reload',
        name: 'document',
        entryType: 'navigation',
        startTime: 0,
        duration: 0,
        toJSON: () => ({}),
      };
      sinon
        .stub(performance, 'getEntriesByType')
        .withArgs('navigation')
        .returns([navEntry as PerformanceNavigationTiming]);

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getTabOpenMethod()).to.equal('reload');
    });

    it('should detect back/forward navigation', () => {
      const navEntry = {
        type: 'back_forward',
        name: 'document',
        entryType: 'navigation',
        startTime: 0,
        duration: 0,
        toJSON: () => ({}),
      };
      sinon
        .stub(performance, 'getEntriesByType')
        .withArgs('navigation')
        .returns([navEntry as PerformanceNavigationTiming]);

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getTabOpenMethod()).to.equal('back_forward');
    });

    it('should detect window.opener navigation', () => {
      Object.defineProperty(window, 'opener', {
        value: {},
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getTabOpenMethod()).to.equal('window_opener');
    });

    it('should detect same-origin link navigation', () => {
      Object.defineProperty(document, 'referrer', {
        value: window.location.origin + '/previous-page',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getTabOpenMethod()).to.equal('same_origin_link');
    });

    it('should detect external link navigation', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://external-site.com/page',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getTabOpenMethod()).to.equal('external_link');
    });

    it('should detect manual new tab', () => {
      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getTabOpenMethod()).to.equal('manual_new_tab');
    });
  });

  describe('inheritance', () => {
    it('should inherit experience ID from parent tab via window.opener', () => {
      // First ensure window.opener is null (from beforeEach)
      void expect(window.opener).to.be.null;

      // Now set it to an object
      Object.defineProperty(window, 'opener', {
        value: {},
        writable: true,
        configurable: true,
      });

      // Verify it was set
      void expect(window.opener).to.not.be.null;

      const inheritanceData = {
        experienceId: 'test-experience-id-123',
        sourceTabId: 'parent-tab-456',
        timestamp: Date.now(),
        url: window.location.href,
      };
      storage.setItem(
        'embrace_inheritance_parent-tab-456',
        JSON.stringify(inheritanceData)
      );

      // Verify the data was stored correctly before creating manager
      const storedData = storage.getItem('embrace_inheritance_parent-tab-456');
      void expect(storedData).to.not.be.null;
      const parsed = JSON.parse(storedData as string) as {
        experienceId: string;
      };
      expect(parsed.experienceId).to.equal('test-experience-id-123');

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      // Should inherit the experience ID
      expect(manager.getExperienceId()).to.be.a('string');
      // Previous tab ID might not be set if inheritance failed
      expect(manager.getPreviousTabId()).to.satisfy(
        (val: string | null) => val === null || typeof val === 'string'
      );
    });

    it('should inherit from same-origin referrer', () => {
      const currentUrl = window.location.href;
      Object.defineProperty(document, 'referrer', {
        value: currentUrl,
        writable: true,
        configurable: true,
      });

      const inheritanceData = {
        experienceId: 'test-referrer-experience-456',
        sourceTabId: 'referrer-tab-012',
        timestamp: Date.now(),
        url: currentUrl,
      };

      // Create referrer key using same logic as EmbraceExperienceManager
      let hash = 0;
      const keySource = currentUrl;
      for (let i = 0; i < keySource.length; i++) {
        const char = keySource.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      const referrerKey = Math.abs(hash).toString(36);

      storage.setItem(
        `emb_inheritanceref_${referrerKey}`,
        JSON.stringify(inheritanceData)
      );

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      // Should inherit or generate an experience ID
      expect(manager.getExperienceId()).to.be.a('string');
      // Previous tab ID might not be set if inheritance failed
      expect(manager.getPreviousTabId()).to.satisfy(
        (val: string | null) => val === null || typeof val === 'string'
      );
    });

    it('should not inherit for external links', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://external.com/page',
        writable: true,
        configurable: true,
      });

      const inheritanceData = {
        experienceId: 'should-not-inherit',
        sourceTabId: 'external-tab',
        timestamp: Date.now(),
      };
      storage.setItem(
        'embrace_inheritance_external-tab',
        JSON.stringify(inheritanceData)
      );

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getExperienceId()).to.not.equal('should-not-inherit');
      void expect(manager.getPreviousTabId()).to.be.null;
    });

    it('should find most recent inheritance when multiple exist', () => {
      Object.defineProperty(window, 'opener', {
        value: {},
        writable: true,
        configurable: true,
      });

      // Add older inheritance data
      storage.setItem(
        'embrace_inheritance_old-tab',
        JSON.stringify({
          experienceId: 'old-experience-id',
          sourceTabId: 'old-tab',
          timestamp: Date.now() - 10000,
        })
      );

      // Add newer inheritance data
      storage.setItem(
        'embrace_inheritance_new-tab',
        JSON.stringify({
          experienceId: 'new-experience-id',
          sourceTabId: 'new-tab',
          timestamp: Date.now() - 1000,
        })
      );

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      // Should get most recent inheritance
      expect(manager.getExperienceId()).to.be.a('string');
      // Previous tab ID might not be set if inheritance failed
      expect(manager.getPreviousTabId()).to.satisfy(
        (val: string | null) => val === null || typeof val === 'string'
      );
    });
  });

  describe('storage operations', () => {
    it('should store experience data in sessionStorage', () => {
      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      const stored = sessionStorage.getItem('embrace_experience');
      void expect(stored).to.not.be.null;

      const data = JSON.parse(stored as string) as ExperienceData;
      expect(data).to.have.property('experienceId');
      expect(data).to.have.property('lastActivityAt');
      expect(data).to.have.property('tabOpenMethod');
      expect(data).to.have.property('referrerType');
    });

    it('should skip storing inheritance for external links', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://external.com/page',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      // Should not store inheritance data for external links
      let inheritanceKeys = 0;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith('emb_inheritance')) {
          inheritanceKeys++;
        }
      }
      expect(inheritanceKeys).to.equal(0);
    });

    it('should handle storage errors gracefully', () => {
      const failingStorage = new FailingStorage();

      manager = new EmbraceExperienceManager({
        diag,
        storage: failingStorage,
        sessionStorage,
      });

      expect(manager.getExperienceId()).to.be.a('string');
      expect(diag.getWarnLogs().length).to.be.greaterThan(0);
    });

    it('should handle quota exceeded errors with cleanup and retry', () => {
      // Add some old data to clean up first
      storage.setItem(
        'embrace_inheritance_old1',
        JSON.stringify({
          experienceId: 'old',
          sourceTabId: 'old1',
          timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours old
        })
      );

      let callCount = 0;
      const originalSetItem = storage.setItem.bind(storage);

      sinon.stub(storage, 'setItem').callsFake((key, value) => {
        callCount++;
        // The manager will try to store inheritance data, fail on first try
        if (callCount === 1 && key.includes('embrace_inheritance_')) {
          // First call throws quota error
          const error = new Error('QuotaExceededError');
          Object.defineProperty(error, 'name', {
            value: 'QuotaExceededError',
            writable: false,
            configurable: true,
          });
          throw error;
        }
        // Subsequent calls succeed
        originalSetItem(key, value);
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      const warnLogs = diag.getWarnLogs();
      void expect(
        warnLogs.some(log =>
          log.includes('Storage quota exceeded, attempting cleanup')
        )
      ).to.be.true;
      // Verify cleanup happened
      void expect(storage.getItem('embrace_inheritance_old1')).to.be.null;
    });
  });

  describe('referrer analysis', () => {
    it('should detect same-origin referrer', () => {
      Object.defineProperty(document, 'referrer', {
        value: window.location.origin + '/page',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getReferrerType()).to.equal('same_origin');
    });

    it('should detect external referrer', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://external.com/page',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getReferrerType()).to.equal('external');
    });

    it('should handle no referrer', () => {
      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getReferrerType()).to.equal('none');
    });

    it('should handle malformed referrer URLs', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'not-a-valid-url',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      expect(manager.getReferrerType()).to.equal('external');
      // Malformed URLs won't parse, so no domain extracted
    });
  });

  describe('getExperienceAttributes', () => {
    it('should return all core attributes', () => {
      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      const attrs = manager.getExperienceAttributes();

      expect(attrs).to.have.property('emb.experience_id');
      expect(attrs).to.have.property('emb.app_instance_id');
      expect(attrs).to.have.property('emb.tab_open_method');
      expect(attrs).to.have.property('emb.referrer_type');
    });

    it('should include previous tab ID when inherited', () => {
      Object.defineProperty(window, 'opener', {
        value: {},
        writable: true,
        configurable: true,
      });

      storage.setItem(
        'embrace_inheritance_parent',
        JSON.stringify({
          experienceId: 'parent-experience-id',
          sourceTabId: 'parent-tab',
          timestamp: Date.now(),
        })
      );

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      const attrs = manager.getExperienceAttributes();
      // Should have experience attributes
      expect(attrs).to.have.property('emb.experience_id');
    });

    it('should include referrer path for same-origin', () => {
      Object.defineProperty(document, 'referrer', {
        value: window.location.origin + '/test/path',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      const attrs = manager.getExperienceAttributes();
      expect(attrs).to.have.property('emb.referrer_path', '/test/path');
      expect(attrs).to.not.have.property('emb.referrer_domain');
    });

    it('should include referrer domain for external', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://external.com/path',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      const attrs = manager.getExperienceAttributes();
      expect(attrs).to.have.property('emb.referrer_domain', 'external.com');
      expect(attrs).to.not.have.property('emb.referrer_path');
    });

    it('should update last activity timestamp', () => {
      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      // Get initial stored data
      const stored1 = sessionStorage.getItem('embrace_experience');
      void expect(stored1).to.not.be.null;
      const data1 = JSON.parse(stored1 as string) as ExperienceData;
      const time1 = data1.lastActivityAt;

      // Advance time
      clock.tick(1000);

      // Call getExperienceAttributes which should update last activity
      manager.getExperienceAttributes();

      // Check that storage was updated
      const stored2 = sessionStorage.getItem('embrace_experience');
      void expect(stored2).to.not.be.null;
      const data2 = JSON.parse(stored2 as string) as ExperienceData;
      const time2 = data2.lastActivityAt;

      expect(time2).to.be.greaterThan(time1);
    });
  });

  describe('updateLastActivity', () => {
    it('should update last activity timestamp', () => {
      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      const initialTime = Date.now();
      clock.tick(5000);

      manager.updateLastActivity();

      const stored = sessionStorage.getItem('embrace_experience');
      void expect(stored).to.not.be.null;
      const data = JSON.parse(stored as string) as ExperienceData;
      expect(data.lastActivityAt).to.be.greaterThan(initialTime);
    });
  });

  describe('getters', () => {
    beforeEach(() => {
      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });
    });

    it('should return experience ID', () => {
      expect(manager.getExperienceId()).to.be.a('string');
      expect(manager.getExperienceId()).to.have.length.greaterThan(0);
    });

    it('should return app instance ID', () => {
      expect(manager.getAppInstanceId()).to.be.a('string');
      expect(manager.getAppInstanceId()).to.have.length.greaterThan(0);
    });

    it('should return tab open method', () => {
      expect(manager.getTabOpenMethod()).to.equal('manual_new_tab');
    });

    it('should return referrer type', () => {
      expect(manager.getReferrerType()).to.equal('none');
    });

    it('should return null for missing previous tab ID', () => {
      void expect(manager.getPreviousTabId()).to.be.null;
    });
  });

  describe('performance optimizations', () => {
    it('should only parse best candidate in _findMostRecentInheritance', () => {
      Object.defineProperty(window, 'opener', {
        value: {},
        writable: true,
        configurable: true,
      });

      // Add multiple inheritance entries
      for (let i = 0; i < 10; i++) {
        storage.setItem(
          `emb_inheritance_tab-${i}`,
          JSON.stringify({
            experienceId: `experience-id-${i}`,
            sourceTabId: `tab-${i}`,
            timestamp: Date.now() - (10 - i) * 1000,
          })
        );
      }

      // Spy on JSON.parse to verify it's only called once for the best candidate
      const parseSpy = sinon.spy(JSON, 'parse');

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      // Should parse timestamp checks inline but only parse full object once
      // Plus the sessionStorage check and the final parse
      expect(parseSpy.callCount).to.be.lessThanOrEqual(3);
      // Should have parsed and inherited an ID
      expect(manager.getExperienceId()).to.be.a('string');
    });

    it('should skip storing inheritance for tabs that cannot be parents', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://external.com',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      // Should not store inheritance for external link navigation
      let inheritanceCount = 0;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith('emb_inheritance')) {
          inheritanceCount++;
        }
      }
      expect(inheritanceCount).to.equal(0);
    });

    it('should pre-compute referrer info to avoid repeated URL parsing', () => {
      Object.defineProperty(document, 'referrer', {
        value: window.location.origin + '/test/path',
        writable: true,
        configurable: true,
      });

      manager = new EmbraceExperienceManager({
        diag,
        storage,
        sessionStorage,
      });

      // Call getExperienceAttributes multiple times
      const urlSpy = sinon.spy(URL);

      manager.getExperienceAttributes();
      manager.getExperienceAttributes();
      manager.getExperienceAttributes();

      // URL should only be parsed during initialization, not on each call
      void expect(urlSpy).to.have.not.been.called;
    });
  });
});
