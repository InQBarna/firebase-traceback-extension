## Welcome!

Welcome to using Traceback.

## Checking correct installation

First please get sure your Firebase console -> Extensions -> Traceback shows "installation completed" state.

### Default hosting

A new hosting should have been automatically created during install for the associated domain.
Check [Firebase Hosting](https://console.firebase.google.com/project/${param:PROJECT_ID}/hosting/sites/${param:PROJECT_ID}-traceback).

The associated domain URL should be: [https://${param:PROJECT_ID}-traceback}.web.app/](https://${param:PROJECT_ID}-traceback.web.app/).

Check iOS associated domain: [https://${param:PROJECT_ID}-traceback.web.app/.well-known/apple-app-site-association](https://${param:PROJECT_ID}-traceback.web.app/.well-known/apple-app-site-association).

### Custom domain on setup

If you selected a custom DOMAIN parameter during setup

Check [Firebase Hosting](https://console.firebase.google.com/project/${param:PROJECT_ID}/hosting/sites/) associated domain URL should be: [https://${param:DOMAIN}}.web.app/](https://${param:DOMAIN}.web.app/).

Check iOS associated domain: [https://${param:DOMAIN}.web.app/.well-known/apple-app-site-association](https://${param:DOMAIN}.web.app/.well-known/apple-app-site-association).
 Or [Firebase Hosting (custom domain)](https://console.firebase.google.com/project/${param:PROJECT_ID}/hosting/sites/${param:DOMAIN})

### Aditional custom domains

You can also create an custom domains instead of using the provided domain: [custom domain/subdomain](https://firebase.google.com/docs/hosting/custom-domain).

## Setting up links as of Firebase Dynamic Links

The extension has automatically created a new Firestore collection called `_traceback_`. Every document in that collection represents a dynamic link with similar behaviour to firebase dynamic links. Please note Traceback supports only some of the features of the old Firebase Dynamic links.

A sample path `/example` was created as a reference. Check it out [here](https://${param:PROJECT_ID}-traceback.web.app/example).

The setup is similar to Dynamic Links and must follow this structure:

```
{
	"path": (required, String)
	"title": (optional, String)
	"description": (optional, String)
    "image": (optional, String)
    "skipPreview": (optional, Bool, defaults to false)
    "followLink": (optional, String")
    "expires": (optional, Timestamp)
}
```

- `path`: represents the URL path for your link (e.g. /referral). **Must start with a backslash**.

- `title`: The title to use when the Dynamic Link is shared in a social post..

- `description`: The description to use when the Dynamic Link is shared in a social post.

- `image`: The URL to an image related to this link. The image should be at least 300x200 px, and less than 300 KB..

- `skipPreview`: TODO, unimplemented. skip the app preview page when the Dynamic Link is opened, and instead redirect to the app or store. The app preview page (enabled by default) can more reliably send users to the most appropriate destination when they open Dynamic Links in apps; however, if you expect a Dynamic Link to be opened only in apps that can open Dynamic Links reliably without this page, you can disable it with this parameter. This parameter will affect the behavior of the Dynamic Link only on iOS.

- `followLink`: The link to open when the app isn't installed. Specify this to do something other than install your app from the Play Store when the app isn't installed, such as open the mobile web version of the content, or display a promotional page for your app. **Must start with "https://"**

- `expires`: specifies the Timestamp after which the link will become inactive. Note: this will still make the link open the app.

## How links work

Any link using the associated domain opened will...

1. If the link is opened on iOS/Android and the app **is installed**, it will open the app.

2. If the link is opened on iOS/Android and the app **is not installed**:

   - If `followLink` is set up, it will redirect the user to that URL.

   - Otherwise, uwer will be redirected to the App Store / Google Play 

3. If you want the link to be opened in other platforms, nothing will happen. You have some alternatives.

   - Set up your hosting manually to serve other contents

   - Create links with `followLink` parameter

## Monitoring

As a best practice, you can [monitor the activity](https://firebase.google.com/docs/extensions/manage-installed-extensions#monitor) of your installed extension, including checks on its health, usage, and logs.
