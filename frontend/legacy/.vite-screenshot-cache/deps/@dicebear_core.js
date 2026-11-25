import __buffer_polyfill from 'vite-plugin-node-polyfills/shims/buffer'
globalThis.Buffer = globalThis.Buffer || __buffer_polyfill
import __global_polyfill from 'vite-plugin-node-polyfills/shims/global'
globalThis.global = globalThis.global || __global_polyfill
import __process_polyfill from 'vite-plugin-node-polyfills/shims/process'
globalThis.process = globalThis.process || __process_polyfill

import {
  createAvatar,
  escape_exports,
  license_exports,
  schema
} from "./chunk-CX2W44XS.js";
import "./chunk-KTOAIN46.js";
export {
  createAvatar,
  escape_exports as escape,
  license_exports as license,
  schema
};
//# sourceMappingURL=@dicebear_core.js.map
