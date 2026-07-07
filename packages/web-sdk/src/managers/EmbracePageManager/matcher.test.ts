import * as chai from 'chai';
import { createRouteMatcher } from './matcher.ts';

const { expect } = chai;

describe('createRouteMatcher', () => {
  it('matches a param template', () => {
    const match = createRouteMatcher(['/order/:id']);
    expect(match('/order/123')).to.equal('/order/:id');
  });

  it('prefers a static segment over a param', () => {
    const match = createRouteMatcher(['/order/:id', '/order/new']);
    expect(match('/order/new')).to.equal('/order/new');
    expect(match('/order/123')).to.equal('/order/:id');
  });

  it('treats wildcards as least specific', () => {
    const match = createRouteMatcher(['/files/*', '/files/:name']);
    expect(match('/files/report')).to.equal('/files/:name');
    expect(match('/files/a/b/c')).to.equal('/files/*');
  });

  it('prefers a static segment over an all-param template on a tie', () => {
    const match = createRouteMatcher(['/:a/:b', '/x/*']);
    expect(match('/x/y')).to.equal('/x/*');
  });

  it('matches templates with multiple params', () => {
    const match = createRouteMatcher(['/users/:uid/posts/:pid']);
    expect(match('/users/1/posts/2')).to.equal('/users/:uid/posts/:pid');
  });

  it('does not match when the URL has fewer segments than the template', () => {
    const match = createRouteMatcher(['/order/:id']);
    expect(match('/order')).to.equal('/order');
  });

  it('normalizes path options and trailing slashes', () => {
    const match = createRouteMatcher(['/order/:state(pending|shipped)']);
    expect(match('/order/pending')).to.equal('/order/:state');
    expect(match('/order/pending/')).to.equal('/order/:state');
  });

  it('falls back to the raw pathname when nothing matches', () => {
    const match = createRouteMatcher(['/order/:id']);
    expect(match('/unknown/path')).to.equal('/unknown/path');
  });

  it('matches the root path', () => {
    const match = createRouteMatcher(['/']);
    expect(match('/')).to.equal('/');
  });
});
