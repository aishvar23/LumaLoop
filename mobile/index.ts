// `react-native-gesture-handler` must be the first import in the entry file so it
// can install its native handlers before anything renders (gesture-handler docs).
import 'react-native-gesture-handler';
// Polyfill `crypto.getRandomValues` before `uuid` loads (Hermes has no reliable
// Web Crypto); this backs the telemetry `eventId`/anonymous id UUIDs (#129, M5).
import 'react-native-get-random-values';
// Polyfill `crypto.subtle` (Hermes lacks WebCrypto). Without it, supabase-js
// downgrades PKCE to the `plain` code-challenge method, which breaks the OAuth
// code exchange ("invalid flow state"). Must run before the Supabase client is
// constructed, i.e. before App imports it. Order: AFTER get-random-values.
import { polyfillWebCrypto } from 'expo-standard-web-crypto';
import { registerRootComponent } from 'expo';

polyfillWebCrypto();

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
