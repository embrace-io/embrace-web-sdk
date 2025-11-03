import { useState } from 'react';

const someArray = [1, 2, 3];

const ComponentWithErrorInRender = () => {
  const [value, setValue] = useState(1);

  return (
    <button type="button" onClick={() => setValue(-1)}>
      Trigger a render error
      {/* @ts-expect-error we want to throw an error in this example */}
      {value === -1 && someArray[value].some.property}
    </button>
  );
};

export default ComponentWithErrorInRender;
