import { PublicClientApplication, LogLevel } from '@azure/msal-browser';
import { frontendConfig } from '$frontendConfig';

const redirectUri = frontendConfig.azure.REDIRECT_URI;

export const msalConfig = {
    auth: {
        clientId: frontendConfig.azure.CLIENT_ID,
        authority: `https://login.microsoftonline.com/${frontendConfig.azure.TENANT_ID}`,
        redirectUri,
        navigateToLoginRequestUrl: true,
        postLogoutRedirectUri: redirectUri
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    },
    system: {
        allowRedirectInIframe: true,
        loggerOptions: {
            loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
                if (containsPii) return;
                
                switch (level) {
                    case LogLevel.Error:
                        console.error(message);
                        return;
                    case LogLevel.Info:
                        console.info(message);
                        return;
                    case LogLevel.Verbose:
                        console.debug(message);
                        return;
                    case LogLevel.Warning:
                        console.warn(message);
                        return;
                }
            }
        }
    }
};

export const loginRequest = {
    scopes: ["User.Read", "email", "profile"]
};

export const msalInstance = new PublicClientApplication(msalConfig); 