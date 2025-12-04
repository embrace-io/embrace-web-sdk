import { addEmbraceSDK, initSDK, sdkControl } from './otel.ts';

addEmbraceSDK();

window.EmbraceWebSdkOnReady.onReady(() => {
  initSDK('dqrt5', 'library-app', true);

  window.EmbraceWebSdkOnReady.onReady(() => {
    console.log('Embrace is ready inside the SDK');

    sdkControl?.log.message(
      'Embrace initialized successfully inside the SDK',
      'info',
    );

    const onLogClick = () => {
      sdkControl?.log.message('Button clicked inside the SDK', 'info');
    };

    const button = document.createElement('button');
    button.textContent = 'Button Created by the SDK';
    button.addEventListener('click', onLogClick);
    document.body.appendChild(button);

    const errorButton = document.createElement('button');
    errorButton.textContent = 'Throw Error Button Created by the SDK';
    errorButton.addEventListener('click', () => {
      throw new Error('This is an error thrown by the SDK');
    });
    document.body.appendChild(errorButton);

    const fetchButton = document.createElement('button');
    fetchButton.textContent = 'Make API call from the library app';
    fetchButton.addEventListener('click', () => {
      console.log('Making API call from the library app');
      fetch('https://jsonplaceholder.typicode.com/posts/2')
        .then((response) => response.json())
        .then(() => {
          console.log('API call from library app successful');
        });
    });
    document.body.appendChild(fetchButton);

    const xhrButton = document.createElement('button');
    xhrButton.textContent = 'Make XHR call from the library app';
    xhrButton.addEventListener('click', () => {
      console.log('Making XHR call from the library app');

      const req = new XMLHttpRequest();
      req.open('GET', 'https://jsonplaceholder.typicode.com/posts/2', true);
      req.addEventListener('load', () => {
        console.log('XHR call from library app successful');
      });
      req.send();
    });
    document.body.appendChild(xhrButton);
  });
});
