import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { getHTMLElementFriendlyName } from './utils.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('clicks/utils', () => {
  describe('getHTMLElementFriendlyName', () => {
    it('should return element with short text', () => {
      const element = document.createElement('button');
      const result = getHTMLElementFriendlyName(element, 'Click me');
      expect(result).to.equal('<button>Click me</button>');
    });

    it('should not add ellipsis when text is exactly at MAX_INNER_TEXT (30 chars)', () => {
      const element = document.createElement('button');
      const text = '123456789012345678901234567890'; // exactly 30 chars
      const result = getHTMLElementFriendlyName(element, text);
      expect(result).to.equal(`<button>${text}</button>`);
      expect(result).to.not.include('...');
    });

    it('should add ellipsis when text is over MAX_INNER_TEXT', () => {
      const element = document.createElement('button');
      const text = '1234567890123456789012345678901'; // 31 chars
      const result = getHTMLElementFriendlyName(element, text);
      expect(result).to.equal(
        '<button>123456789012345678901234567890...</button>',
      );
    });

    it('should include className when present', () => {
      const element = document.createElement('button');
      element.className = 'btn primary';
      const result = getHTMLElementFriendlyName(element, 'Click');
      expect(result).to.equal('<button class="btn primary">Click</button>');
    });

    it('should not include class attribute when className is empty', () => {
      const element = document.createElement('button');
      element.className = '';
      const result = getHTMLElementFriendlyName(element, 'Click');
      expect(result).to.equal('<button>Click</button>');
    });

    it('should handle different node types - button', () => {
      const element = document.createElement('button');
      const result = getHTMLElementFriendlyName(element, 'Submit');
      expect(result).to.equal('<button>Submit</button>');
    });

    it('should handle different node types - div', () => {
      const element = document.createElement('div');
      const result = getHTMLElementFriendlyName(element, 'Content');
      expect(result).to.equal('<div>Content</div>');
    });

    it('should handle different node types - span', () => {
      const element = document.createElement('span');
      const result = getHTMLElementFriendlyName(element, 'Text');
      expect(result).to.equal('<span>Text</span>');
    });

    it('should handle different node types - anchor', () => {
      const element = document.createElement('a');
      const result = getHTMLElementFriendlyName(element, 'Link');
      expect(result).to.equal('<a>Link</a>');
    });

    it('should handle empty text', () => {
      const element = document.createElement('button');
      const result = getHTMLElementFriendlyName(element, '');
      expect(result).to.equal('<button></button>');
    });

    it('should truncate very long text correctly', () => {
      const element = document.createElement('div');
      const longText =
        'This is a very long text that should be truncated because it exceeds the maximum allowed length';
      const result = getHTMLElementFriendlyName(element, longText);
      // Truncates to 30 chars ('This is a very long text that ') and adds ellipsis
      expect(result).to.equal('<div>This is a very long text that ...</div>');
    });

    it('should lowercase the node name', () => {
      const element = document.createElement('BUTTON');
      const result = getHTMLElementFriendlyName(element, 'Click');
      // createElement normalizes to uppercase, nodeName returns uppercase, but we toLowerCase
      expect(result).to.equal('<button>Click</button>');
    });
  });
});
