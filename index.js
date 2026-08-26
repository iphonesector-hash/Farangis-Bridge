import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import App from './App';
import BrandSplash from './src/components/BrandSplash';

function FarangisRoot() {
  const [ready, setReady] = useState(false);
  return ready ? <App /> : <BrandSplash onDone={() => setReady(true)} />;
}

registerRootComponent(FarangisRoot);
