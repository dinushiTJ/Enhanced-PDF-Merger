// Google Drive integration settings for the merger. These values are public
// by design: Google locks the client ID to the site's authorized origins and
// the API key to its HTTP referrers. Leave them empty to hide the Drive
// features entirely. See "Google Drive setup" in the README.
const DRIVE_CONFIG = {
    clientId: '',   // OAuth 2.0 Client ID (…apps.googleusercontent.com)
    apiKey: '',     // API key restricted to the Google Picker API
    appId: ''       // Google Cloud project number
};
