/* src/stores/videoStore.ts */

import { writable } from "svelte/store";

const initialVideos = [
  "X1_Single_Lewis_Hamilton-GENERIC_1280x730.mp4",
  "FA24_TH_T1_OCTOBER_DUO_10_B_ PAID_ LOGO_SOUND_1920_1080.mp4",
  "ECOM_TOMMY_STRAY_KIDS_6sec_001_3412x1892_MP4_Audio_NoLogo.mp4",
  "FA24_TH_T1_SEPTEMBER_ABBEY_6_C_ECOM_ NO LOGO_SOUND_3412_1892.mp4",
  "X1_DUO_GR_LH-GENERIC_1280x730.mp4",
  "ECOM_TOMMY_STRAY_KIDS_6sec_002_3412x1892_MP4_Audio_NoLogo.mp4",
  "FA24_TH_T1_OCTOBER_DUO_6_A_ECOM_ NO LOGO_SOUND_3412_1892.mp4",
  "ECOM_TOMMY_STRAY_KIDS_6sec_003_3412x1892_MP4_Audio_NoLogo.mp4",
  "FA24_TH_T1_SEPTEMBER_PATRIC_6_B_ECOM_ NO LOGO_SOUND_3412_1892.mp4",
];

export const videos = writable(initialVideos);
