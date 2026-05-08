import type { Attributes } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { NoOpSpanSessionManager } from '../api-sessions/manager/NoOpSpanSessionManager/index.ts';
import type { SpanSessionManagerInternal } from '../managers/EmbraceSpanSessionManager/index.ts';
import {
  applyUserSessionAttributesToSpan,
  createUserSessionAttributes,
} from './applyUserSessionAttributes.ts';

const { expect } = chai;

type ManagerStubValues = {
  partId: string | null;
  userSessionId: string | null;
  previousUserSessionId: string | null;
  override: string | null;
};

const stubManager = (
  values: Partial<ManagerStubValues> = {},
): SpanSessionManagerInternal => {
  const v: ManagerStubValues = {
    partId: null,
    userSessionId: null,
    previousUserSessionId: null,
    override: null,
    ...values,
  };
  return Object.assign(new NoOpSpanSessionManager(), {
    getSessionPartId: () => v.partId,
    getUserSessionId: () => v.userSessionId,
    getPreviousUserSessionId: () => v.previousUserSessionId,
    getUserSessionIdOverride: () => v.override,
  });
};

describe('createUserSessionAttributes', () => {
  it('reads all values from the manager when input has no emb.* keys', () => {
    const manager = stubManager({
      partId: 'part-1',
      userSessionId: 'user-1',
      previousUserSessionId: 'prev-1',
    });

    const result = createUserSessionAttributes({}, manager);

    expect(result).to.deep.equal({
      'emb.session_part_id': 'part-1',
      'emb.user_session_id': 'user-1',
      'emb.user_session_previous_id': 'prev-1',
      'session.id': 'user-1',
    });
  });

  it('emits empty strings for all keys when manager has no active part', () => {
    const result = createUserSessionAttributes({}, stubManager());

    expect(result).to.deep.equal({
      'emb.session_part_id': '',
      'emb.user_session_id': '',
      'emb.user_session_previous_id': '',
      'session.id': '',
    });
  });

  it('prefers an existing emb.session_part_id over the manager', () => {
    const manager = stubManager({
      partId: 'manager-part',
      userSessionId: 'user-1',
    });

    const result = createUserSessionAttributes(
      { 'emb.session_part_id': 'attr-part' },
      manager,
    );

    expect(result['emb.session_part_id']).to.equal('attr-part');
    expect(result['emb.user_session_id']).to.equal('user-1');
  });

  it('prefers an existing emb.user_session_id over the manager', () => {
    const manager = stubManager({
      partId: 'part-1',
      userSessionId: 'manager-user',
      previousUserSessionId: 'prev-1',
    });

    const result = createUserSessionAttributes(
      { 'emb.user_session_id': 'attr-user' },
      manager,
    );

    expect(result['emb.user_session_id']).to.equal('attr-user');
    expect(result['emb.user_session_previous_id']).to.equal('prev-1');
    expect(result['session.id']).to.equal('attr-user');
  });

  it('prefers an existing emb.user_session_previous_id over the manager', () => {
    const manager = stubManager({
      partId: 'part-1',
      userSessionId: 'user-1',
      previousUserSessionId: 'manager-prev',
    });

    const result = createUserSessionAttributes(
      { 'emb.user_session_previous_id': 'attr-prev' },
      manager,
    );

    expect(result['emb.user_session_previous_id']).to.equal('attr-prev');
  });

  it('omits session.id from the result when input already has session.id', () => {
    const manager = stubManager({
      partId: 'part-1',
      userSessionId: 'user-1',
    });

    const result = createUserSessionAttributes(
      { 'session.id': 'pre-existing' },
      manager,
    );

    expect(result).to.not.have.property('session.id');
    expect(result['emb.user_session_id']).to.equal('user-1');
  });

  it('uses the user-session-id override for session.id when set', () => {
    const manager = stubManager({
      partId: 'part-1',
      userSessionId: 'user-1',
      override: 'override-id',
    });

    const result = createUserSessionAttributes({}, manager);

    expect(result['session.id']).to.equal('override-id');
    expect(result['emb.user_session_id']).to.equal('user-1');
  });

  it('uses the override for session.id even when input pins emb.user_session_id', () => {
    const manager = stubManager({
      partId: 'part-1',
      userSessionId: 'manager-user',
      override: 'override-id',
    });

    const result = createUserSessionAttributes(
      { 'emb.user_session_id': 'attr-user' },
      manager,
    );

    expect(result['emb.user_session_id']).to.equal('attr-user');
    expect(result['session.id']).to.equal('override-id');
  });

  it('lets a pre-existing input session.id win over the manager override', () => {
    const manager = stubManager({
      partId: 'part-1',
      userSessionId: 'user-1',
      override: 'override-id',
    });

    const result = createUserSessionAttributes(
      { 'session.id': 'pre-existing' },
      manager,
    );

    expect(result).to.not.have.property('session.id');
  });

  it('forces user_session_id and previous_id to "" when partId is empty', () => {
    const manager = stubManager({
      userSessionId: 'manager-user',
      previousUserSessionId: 'manager-prev',
    });

    const result = createUserSessionAttributes(
      { 'emb.session_part_id': '' },
      manager,
    );

    expect(result['emb.session_part_id']).to.equal('');
    expect(result['emb.user_session_id']).to.equal('');
    expect(result['emb.user_session_previous_id']).to.equal('');
  });

  it('falls back to manager values when emb.* attribute values are non-strings', () => {
    const manager = stubManager({
      partId: 'manager-part',
      userSessionId: 'manager-user',
      previousUserSessionId: 'manager-prev',
    });

    const result = createUserSessionAttributes(
      {
        'emb.session_part_id': 42,
        'emb.user_session_id': ['x'],
        'emb.user_session_previous_id': true,
      } as unknown as Attributes,
      manager,
    );

    expect(result['emb.session_part_id']).to.equal('manager-part');
    expect(result['emb.user_session_id']).to.equal('manager-user');
    expect(result['emb.user_session_previous_id']).to.equal('manager-prev');
  });

  it('keeps the start-time session when input has emb.* but the manager has rolled to a new session', () => {
    const manager = stubManager({
      partId: 'part-2',
      userSessionId: 'user-2',
      previousUserSessionId: 'user-1',
    });

    const result = createUserSessionAttributes(
      {
        'emb.session_part_id': 'part-1',
        'emb.user_session_id': 'user-1',
        'emb.user_session_previous_id': 'user-0',
      },
      manager,
    );

    expect(result).to.deep.equal({
      'emb.session_part_id': 'part-1',
      'emb.user_session_id': 'user-1',
      'emb.user_session_previous_id': 'user-0',
      'session.id': 'user-1',
    });
  });
});

describe('applyUserSessionAttributesToSpan', () => {
  const makeSpan = (attributes: Attributes) =>
    ({ attributes: { ...attributes } }) as unknown as ReadableSpan;

  it('mutates the span attributes in place', () => {
    const span = makeSpan({});
    const before = span.attributes;

    applyUserSessionAttributesToSpan(
      span,
      stubManager({ partId: 'part-1', userSessionId: 'user-1' }),
    );

    expect(span.attributes).to.equal(before);
    expect(span.attributes['emb.session_part_id']).to.equal('part-1');
    expect(span.attributes['emb.user_session_id']).to.equal('user-1');
    expect(span.attributes['session.id']).to.equal('user-1');
  });

  it('preserves emb.* values stamped on the span at onStart', () => {
    const span = makeSpan({
      'emb.session_part_id': 'start-part',
      'emb.user_session_id': 'start-user',
      'custom.attr': 'keep-me',
    });

    applyUserSessionAttributesToSpan(
      span,
      stubManager({
        partId: 'rolled-part',
        userSessionId: 'rolled-user',
      }),
    );

    expect(span.attributes['emb.session_part_id']).to.equal('start-part');
    expect(span.attributes['emb.user_session_id']).to.equal('start-user');
    expect(span.attributes['custom.attr']).to.equal('keep-me');
  });

  it('does not overwrite a pre-existing session.id on the span', () => {
    const span = makeSpan({ 'session.id': 'pre-existing' });

    applyUserSessionAttributesToSpan(
      span,
      stubManager({ partId: 'part-1', userSessionId: 'user-1' }),
    );

    expect(span.attributes['session.id']).to.equal('pre-existing');
  });
});
