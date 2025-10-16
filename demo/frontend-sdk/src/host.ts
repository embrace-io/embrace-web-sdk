import { addEmbraceSDK, initSDK, sdkControl } from './otel';

addEmbraceSDK();

window.EmbraceWebSdkOnReady.onReady(() => {
  initSDK('san7c', 'host-app', false);

  window.EmbraceWebSdkOnReady.onReady(() => {
    console.log('Embrace is ready in the host app');

    sdkControl!.log.message(
      'Embrace initialized successfully in the host app',
      'info'
    );

    const onLogClick = () => {
      sdkControl!.log.message('Button clicked in the host app', 'info');
    };

    const button = document.createElement('button');
    button.textContent = 'Button Created by the host app';
    button.addEventListener('click', onLogClick);
    document.body.appendChild(button);

    const errorButton = document.createElement('button');
    errorButton.textContent = 'Throw Error Button by the host app';
    errorButton.addEventListener('click', () => {
      throw new Error('This is an error thrown by the host app');
    });
    document.body.appendChild(errorButton);

    const fetchButton = document.createElement('button');
    fetchButton.textContent = 'Make Fetch call from the host app';
    fetchButton.addEventListener('click', () => {
      console.log('Making Fetch call from the host app');
      fetch('https://jsonplaceholder.typicode.com/posts/2')
        .then(response => response.json())
        .then(() => {
          console.log('Fetch call from host app successful');
        });
    });
    document.body.appendChild(fetchButton);

    const xhrButton = document.createElement('button');
    xhrButton.textContent = 'Make XHR call from the host app';
    xhrButton.addEventListener('click', () => {
      console.log('Making XHR call from the host app');

      const req = new XMLHttpRequest();
      req.open('GET', 'https://jsonplaceholder.typicode.com/posts/2', true);
      req.addEventListener('load', () => {
        console.log('XHR call from host app successful');
      });
      req.send();
    });
    document.body.appendChild(xhrButton);
  });
});
