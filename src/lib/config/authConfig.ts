import { PublicClientApplication, LogLevel, type Configuration } from '@azure/msal-browser';
import { frontendConfig } from '$frontendConfig';
import { browser } from '$app/environment';

let msalInstance: PublicClientApplication | null = null;

export const msalConfig = {
    auth: {
        clientId: frontendConfig.azure.CLIENT_ID,
        authority: `https://login.microsoftonline.com/${frontendConfig.azure.TENANT_ID}`,
        redirectUri: frontendConfig.azure.REDIRECT_URI,
        navigateToLoginRequestUrl: true,
        cookieOptions: {
            secure: true,
            sameSite: "lax"
        }
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: true,
        secureCookies: true
    },
    system: {
        allowRedirectInIframe: true,
        tokenRenewalOffsetSeconds: 300,
        redirectNavigationTimeout: 10000, // 10 seconds timeout for redirects
        loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
                if (!containsPii) {
                    console.log(`MSAL - ${level}: ${message}`);
                }
            },
            piiLoggingEnabled: false
        }
    }
};

export const loginRequest = {
    scopes: ["User.Read", "email", "profile"]
};

export const getMsalInstance = async () => {
    if (!msalInstance && browser) {
        msalInstance = new PublicClientApplication(msalConfig);
        await msalInstance.initialize();
    }
    return msalInstance;
};

export const graphConfig = {
    graphMeEndpoint: "https://graph.microsoft.com/v1.0/me"
}; 
