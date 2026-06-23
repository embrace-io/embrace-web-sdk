import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { FakeInstrumentation } from '../../../tests/utils/index.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceInstrumentationBase', () => {
  let instrumentation: FakeInstrumentation;
  let onEnableSpy: sinon.SinonSpy;
  let onDisableSpy: sinon.SinonSpy;

  beforeEach(() => {
    instrumentation = new FakeInstrumentation();
    // start Instrumentation in a disabled state so assertions are consistent
    instrumentation.disable();
    onEnableSpy = sinon.spy(instrumentation, 'onEnable');
    onDisableSpy = sinon.spy(instrumentation, 'onDisable');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('fires onEnable once when enabling a disabled instrumentation', () => {
    instrumentation.enable();
    instrumentation.enable();

    expect(onEnableSpy).to.have.been.calledOnce;
  });

  it('fires onDisable once when disabling an enabled instrumentation', () => {
    instrumentation.enable();
    instrumentation.disable();
    instrumentation.disable();

    expect(onDisableSpy).to.have.been.calledOnce;
  });

  it('fires each hook once per state flip across a full toggle cycle', () => {
    instrumentation.enable();
    instrumentation.disable();
    instrumentation.enable();

    expect(onEnableSpy).to.have.been.calledTwice;
    expect(onDisableSpy).to.have.been.calledOnce;
  });
});
