/* src/lib/config/video.config.ts */

import { get } from 'svelte/store';
import { videos as videoStore } from '../../stores/videoStore';

export const videoConfig = {
    // Use the full list from store for production
    defaultVideos: get(videoStore),
    // Keep only the videos we have locally for development
    devVideos: [
        'X1_DUO_GR_LH-GENERIC_1280x730.mp4',
        'ECOM_TOMMY_STRAY_KIDS_6sec_002_3412x1892_MP4_Audio_NoLogo.mp4',
        'FA24_TH_T1_OCTOBER_DUO_6_A_ECOM_NO_LOGO_SOUND_3412_1892.mp4'
    ]
}; 