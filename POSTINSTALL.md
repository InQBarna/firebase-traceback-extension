# Welcome!

Welcome to using Traceback.

# Checking correct installation

First please get sure your Firebase console -> Extensions -> Traceback shows "installation completed" state.

## Default hosting

A new hosting should have been automatically created during install for the associated domain.
Check [Firebase Hosting](https://console.firebase.google.com/project/${param:PROJECT_ID}/hosting/sites/${param:PROJECT_ID}-traceback).

The associated domain URL should be: [https://${param:PROJECT_ID}-traceback.web.app/](https://${param:PROJECT_ID}-traceback.web.app/).

**Verify Associated Domains:**

- **iOS (Universal Links)**: [https://${param:PROJECT_ID}-traceback.web.app/.well-known/apple-app-site-association](https://${param:PROJECT_ID}-traceback.web.app/.well-known/apple-app-site-association)
  - Should return JSON with `applinks` and your iOS Team ID `${param:IOS_TEAM_ID}` and Bundle ID `${param:IOS_BUNDLE_ID}`

- **Android (App Links)**: [https://${param:PROJECT_ID}-traceback.web.app/.well-known/assetlinks.json](https://${param:PROJECT_ID}-traceback.web.app/.well-known/assetlinks.json)
  - Should return JSON with `android_app` and your Android package name `${param:ANDROID_BUNDLE_ID}`

## Custom domain on setup

**If you provided a custom DOMAIN parameter during installation**, your associated domain URL will be based on that custom domain instead of the default `${param:PROJECT_ID}-traceback`.

In this case:
- Check your [Firebase Hosting sites](https://console.firebase.google.com/project/${param:PROJECT_ID}/hosting/sites/) to find your custom domain
- Your associated domain URLs will be at `https://YOUR-CUSTOM-DOMAIN.web.app/`
- Verify the well-known files at:
  - iOS: `https://YOUR-CUSTOM-DOMAIN.web.app/.well-known/apple-app-site-association`
  - Android: `https://YOUR-CUSTOM-DOMAIN.web.app/.well-known/assetlinks.json`

Replace `YOUR-CUSTOM-DOMAIN` with the DOMAIN value you specified during installation.

## Additional custom domains

You can also create additional custom domains instead of using the provided domain: [custom domain/subdomain](https://firebase.google.com/docs/hosting/custom-domain).

# Setting up links as of Firebase Dynamic Links

The extension has automatically created a new Firestore collection called `_traceback_` with the following structure:

```
_traceback_
├── dynamiclinks
│   └── records (collection)
│       └── {linkId} (documents - your dynamic links)
│           └── analytics (subcollection - daily metrics)
```

## Dynamic Links

Dynamic links are stored in `_traceback_/dynamiclinks/records/`. Each document represents a dynamic link with similar behavior to Firebase Dynamic Links. Please note Traceback supports only some of the features of the old Firebase Dynamic Links.

A sample path `/example` was created as a reference. Check it out [here](https://${param:PROJECT_ID}-traceback.web.app/example).

The setup is similar to Dynamic Links and must follow this structure:

```
{
	"path": (required, String)
   "followLink": (optional, String")
	"title": (optional, String)
	"description": (optional, String)
   "image": (optional, String)
   "skipPreview": (optional, Bool, defaults to false) // TODO
}
```

- `path`: represents the URL path for your link (e.g. /referral). **Must start with a forward slash**.

- `followLink`: The link to open inside the app as deep link, or the link to open on desktop. Specify this to do something other than opening the app or opening your app from Appstore / Play Store when the app isn't installed. **Must start with "https://"**

- `title`: The title to use when the Dynamic Link is shared in a social post. Social preview may show this title.

- `description`: The description to use when the Dynamic Link is shared in a social post. Social preview may show this description.

- `image`: The URL to an image related to this link. The image should be at least 300x200 px, and less than 300 KB. Social preview may show this image.

- `skipPreview`: TODO, unimplemented. skip the app preview page when the Dynamic Link is opened, and instead redirect to the app or store. The app preview page (enabled by default) can more reliably send users to the most appropriate destination when they open Dynamic Links in apps; however, if you expect a Dynamic Link to be opened only in apps that can open Dynamic Links reliably without this page, you can disable it with this parameter. This parameter will affect the behavior of the Dynamic Link only on iOS.

## How links work

Any link using the associated domain opened will...

1. If the link is opened on iOS/Android and the app **is installed**, it will open the app.

2. If the link is opened on iOS/Android and the app **is not installed**: it will open the AppsStore or Play Store for app download.

3. If the link is opened on Desktop: it will redirect to 'followLink' in the browser

# Deferred Deep Linking

Deferred deep linking allows you to attribute app installations to specific links and deliver the user to the correct content after they install your app.

## How It Works

1. **User clicks link** (pre-install) - The extension saves device heuristics (screen size, timezone, language, etc.)
2. **User installs app** - App opens for the first time
3. **App requests attribution** (post-install) - Your app sends device fingerprint to match against saved heuristics
4. **Extension returns the original link** - App can navigate to the appropriate content

## Implementation

To implement deferred deep linking in your mobile app, you can integrate the Traceback SDK or replicate its behavior:

### iOS Integration
Use the official iOS SDK for seamless integration:
- **Repository**: [traceback-iOS](https://github.com/InQBarna/traceback-iOS)
- **Installation**: Follow the setup guide in the repository
- The SDK automatically collects device heuristics and calls `v1_postinstall_search_link` on first app open
- Returns the attributed dynamic link (if any) to your app

### Android Integration
Use the official Android SDK for seamless integration:
- **Repository**: [traceback-android](https://github.com/InQBarna/traceback-android)
- **Installation**: Follow the setup guide in the repository
- The SDK automatically collects device heuristics and calls `v1_postinstall_search_link` on first app open
- Returns the attributed dynamic link (if any) to your app

### Manual Integration
If you prefer to implement attribution manually without the SDK:

1. **Configure your extension URL** in your app
2. **On first app launch**, collect device fingerprint data:
   - Device model, OS version, screen resolution
   - Language, timezone
   - App installation timestamp
3. **Send POST request** to `https://${param:PROJECT_ID}-traceback.web.app/v1_postinstall_search_link`
4. **Process the response** to get the attributed link and navigate to the appropriate content

Refer to the SDK repositories for detailed examples and best practices.

# API

Either for debugging or for remote access to the dynamic links created for the extension, there are some endpoints that provide access to dynamic links. These endpoints are secured.

## API Keys

A default API key was automatically created during installation to access secured debug endpoints.
You can find your API key in Firestore at `_traceback_/apikeys/records/` or check the Cloud Functions logs from the installation.

## Debug endpoints

- `v1_doctor` - Extension health check
- `v1_campaigns` - List all campaigns (JSON)
- `v1_campaign_debug` - Interactive campaign list (HTML)

To use these endpoints, include the API key in the request header:
```bash
curl -H "x-traceback-api-key: YOUR-API-KEY" \
  https://${param:PROJECT_ID}-traceback.web.app/v1_doctor
```

## Monitoring

As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.
