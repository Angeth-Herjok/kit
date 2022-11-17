import './hot-reload';

import React from 'react';
import { createRoot } from 'react-dom/client';
import AdaptorDocs from '@openfn/adaptor-docs';

const root = createRoot(document.getElementById("root"));

root.render(
  <AdaptorDocs specifier="@openfn/language-common@1.7.4" onInsert={console.log}/>
);