import * as chai from 'chai';
import { getSelector } from './getSelector.ts';

const { expect } = chai;

describe('getSelector', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('returns an empty string for null', () => {
    expect(getSelector(null)).to.equal('');
  });

  it('uses #id when the target has an id and stops walking', () => {
    const el = document.createElement('button');
    el.id = 'inner';

    const parent = document.createElement('section');
    parent.id = 'outer';
    parent.append(el);
    container.append(parent);

    expect(getSelector(el)).to.equal('#inner');
  });

  it('uses the lowercased tag name when there is no id or class', () => {
    const el = document.createElement('span');

    const root = document.createElement('section');
    root.id = 'root';
    root.append(el);
    container.append(root);

    expect(getSelector(el)).to.equal('#root>span');
  });

  it('appends a single class to the tag name', () => {
    const el = document.createElement('button');
    el.className = 'cta';

    const root = document.createElement('section');
    root.id = 'root';
    root.append(el);
    container.append(root);

    expect(getSelector(el)).to.equal('#root>button.cta');
  });

  it('sorts multiple classes alphabetically', () => {
    const el = document.createElement('button');
    el.className = 'joseph loves dogs';

    const root = document.createElement('section');
    root.id = 'root';
    root.append(el);
    container.append(root);

    expect(getSelector(el)).to.equal('#root>button.dogs.joseph.loves');
  });

  it('walks parent chain with > separator and stops at the first ancestor id', () => {
    const inner = document.createElement('button');
    inner.className = 'cta';

    const middle = document.createElement('div');
    middle.className = 'wrap';
    middle.append(inner);

    const root = document.createElement('section');
    root.id = 'root';
    root.append(middle);
    container.append(root);

    expect(getSelector(inner)).to.equal('#root>div.wrap>button.cta');
  });

  it('returns the partial selector when adding the next ancestor would exceed the length cap', () => {
    const inner = document.createElement('button');
    inner.className = 'b'.repeat(50);

    const middle = document.createElement('div');
    middle.className = 'a'.repeat(50);
    middle.append(inner);

    const root = document.createElement('section');
    root.id = 'root';
    root.append(middle);
    container.append(root);

    const result = getSelector(inner);
    expect(result.length).to.be.at.most(99);
    expect(result.startsWith('button.')).to.equal(true);
  });

  it('returns the first part alone when sel is empty and the part itself exceeds the cap', () => {
    const el = document.createElement('button');
    el.className = 'x'.repeat(120);
    container.append(el);

    const result = getSelector(el);
    expect(result).to.equal(`button.${'x'.repeat(120)}`);
  });

  it('returns an empty string when the walk throws', () => {
    const throwingNode = {
      nodeType: 1,
      get id(): string {
        throw new Error('boom');
      },
    } as unknown as Node;

    expect(getSelector(throwingNode)).to.equal('');
  });
});
