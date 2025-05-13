<p align="center">
  <picture>
    <img width="200px" src="https://raw.githubusercontent.com/InQBarna/firebase-traceback-extension/refs/heads/main/icon.png" alt="Project icon">
  </picture>
</p>

# Traceback - Dynamic Links Replacement

**Author**: InQBarna ([http://www.inqbarna.com](https://www.inqbarna.com))

**Description**: Creates and setups an associated domain for your mobile project universal / deep links and recreates the capabilities of firebase dynamic links: post-appstore install detection, dynamic links...

**Reference**: HIGHLY inspired in JauntyBrain's flowlinks extension ([https://flowlinks.app](https://flowlinks.app)). Which was missing some key features for our projects.

Missing a feature or found a bug? Feel free to submit a [bug report or a feature request](https://github.com/InQBarna/firebase-traceback-extension/issues). Pull requests are always welcome!

## Details

Traceback is a replacement of [Dynamic Links](https://firebase.google.com/support/dynamic-links-faq) wich are being deprecated.

This extension allows you to setup your associated domain for iOS and android opening universal / deep links.
Either an existing or new **Firebase Hosting** website & domain will be automatically created during initialization

You can also setup dynamic links in a **Cloud Firestore** collection.

## Installation

### Manual / Firebase Console

Follow [this link](https://console.firebase.google.com/project/_/extensions/install?ref=inqbarna/traceback).

### Using Firebase CLI

If you use firebase CLI on your project for firebase cloud functions of hosting, we recommend using also the firebase cli for installation

```bash
firebase ext:install inqbarna/traceback --project=<your-project-id>
```

If you user firebase CLI, but already installed using the web interface, we recommend synching your firebase.json file

```bash
firebase ext:export
```

### Additional setup

Before installing this extension, make sure that you’ve set up the following services in your Firebase project:

- Cloud Firestore database
- Firebase Hosting

### Billing

To install an extension, your project must be on the [Blaze (pay as you go) plan](https://firebase.google.com/pricing)

This extension uses other Firebase and Google Cloud Platform services, which have associated charges if you exceed the service’s no-cost tier:

- Cloud Firestore
- Cloud Functions (Node.js 10+ runtime. [See FAQs](https://firebase.google.com/support/faq#extensions-pricing))

## Client side integration

### iOS

Use the companion iOS SDK for easier integration https://github.com/InQBarna/traceback-iOS. Follow the instruction of the SDK

### Android

TODO:

## Creating links

### Manually

TODO:

## Contributing

Check [Contributing Guide](CONTRIBUTING.md).
