import { useState } from 'react';

const someArray = [1, 2, 3];

const ComponentWithErrorInRender = () => {
  const [value, setValue] = useState(1);

  return (
    <button onClick={() => setValue(-1)}>
      Trigger a render error inside EmbraceErrorBoundary
      {/* @ts-ignore */}
      {value === -1 && someArray[value].some.property}
    </button>
  );
};

export default ComponentWithErrorInRender;
