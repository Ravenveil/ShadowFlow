import __buffer_polyfill from 'vite-plugin-node-polyfills/shims/buffer'
globalThis.Buffer = globalThis.Buffer || __buffer_polyfill
import __global_polyfill from 'vite-plugin-node-polyfills/shims/global'
globalThis.global = globalThis.global || __global_polyfill
import __process_polyfill from 'vite-plugin-node-polyfills/shims/process'
globalThis.process = globalThis.process || __process_polyfill

import {
  changeLanguage,
  createInstance,
  dir,
  exists,
  getFixedT,
  hasLoadedNamespace,
  init,
  instance,
  isSafeLanguageCode,
  keysFromSelector,
  loadLanguages,
  loadNamespaces,
  loadResources,
  reloadResources,
  setDefaultNamespace,
  t,
  use
} from "./chunk-T3WWCZNB.js";
import "./chunk-KTOAIN46.js";
export {
  changeLanguage,
  createInstance,
  instance as default,
  dir,
  exists,
  getFixedT,
  hasLoadedNamespace,
  init,
  isSafeLanguageCode,
  keysFromSelector as keyFromSelector,
  loadLanguages,
  loadNamespaces,
  loadResources,
  reloadResources,
  setDefaultNamespace,
  t,
  use
};
//# sourceMappingURL=i18next.js.map
