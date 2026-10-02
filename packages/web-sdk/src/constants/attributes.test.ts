import * as chai from 'chai';
import {
  KEY_EMB_SESSION_PART_ID,
  KEY_EMB_USER_SESSION_ID,
} from './attributes.ts';

const { expect } = chai;

describe('attributes generated from the embrace-semconv registry', () => {
  // `satisfies` makes the type-check fail when a generated constant's value changes, so
  // `make validate-generated` catches a wrong key without running this suite.
  it('should keep the keys the backend reads', () => {
    expect(KEY_EMB_USER_SESSION_ID satisfies 'emb.user_session_id').to.equal(
      'emb.user_session_id',
    );
    expect(KEY_EMB_SESSION_PART_ID satisfies 'emb.session_part_id').to.equal(
      'emb.session_part_id',
    );
  });
});
