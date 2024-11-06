// Create a new config file for video settings
export const videoConfig = {
    baseUrl: import.meta.env.PUBLIC_VIDEO_BASE_URL || '/idle-videos/',
    defaultVideos: [
        'ECOM_TOMMY_STRAY_KIDS_6sec_002_3412x1892_MP4_Audio_NoLogo.mp4',
        'FA24_TH_T1_OCTOBER_DUO_6_A_ECOM_ NO LOGO_SOUND_3412_1892.mp4',
        'X1_DUO_GR_LH-GENERIC_1280x730.mp4'
    ],
    // Add fallback URL for development videos
    fallbackBaseUrl: '/idle-videos/'
}; 