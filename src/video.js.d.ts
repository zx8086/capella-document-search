/* src/video.js.d.ts */

import videojs from "video.js";

declare global {
  interface Window {
    videojs: typeof videojs;
  }
}
