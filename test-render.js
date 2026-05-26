
    import 'jsdom-global/register.js';
    import { createElement } from 'react';
    import { renderToString } from 'react-dom/server';
    import App from './src/App.tsx';
    console.log(renderToString(createElement(App)));
  