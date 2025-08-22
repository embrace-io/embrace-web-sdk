import { addEmbraceSDK, initSDK, sdkControl } from '../../shared/otel';

addEmbraceSDK();

window.EmbraceWebSdkOnReady.onReady(() => {
  initSDK('san7c');

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

    console.log('Making API call from the host app');
    fetch('https://jsonplaceholder.typicode.com/posts/2')
      .then(response => response.json())
      .then(() => {
        console.log('API call from host app successful');
      });
  });
});
