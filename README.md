# Traceback - Dynamic Links Replacement

**Author**: InQBarna ([http://www.inqbarna.com](https://www.inqbarna.com))

**Install**: Follow [this link](https://console.firebase.google.com/project/_/extensions/install?ref=inqbarna/firebase-traceback).

**Description**: Setup an associated domain for your mobile project universal / deep links.

**Reference**: HIGHLY inspired in JauntyBrain's flowlinks extension ([https://flowlinks.app](https://flowlinks.app)). Which was missing some key features for our projects.

---

Missing a feature or found a bug? Feel free to submit a [bug report or a feature request](https://github.com/InQBarna/firebase-traceback-extension/issues). Pull requests are always welcome!

### Installation: Firebase CLI

```bash
firebase ext:install inqbarna/traceback --project=<your-project-id>
```

---

### Details

Traceback is a replacement of [Dynamic Links](https://firebase.google.com/support/dynamic-links-faq) wich are being deprecated.

This extension allows you to setup your associated domain for iOS and android opening universal / deep links.
Either an existing or new **Firebase Hosting** website & domain will be automatically created during initialization

You can also setup dynamic links in a **Cloud Firestore** collection.

### Additional setup

Before installing this extension, make sure that you’ve set up the following services in your Firebase project:

- Cloud Firestore database
- Firebase Hosting

### Billing

To install an extension, your project must be on the [Blaze (pay as you go) plan](https://firebase.google.com/pricing)

This extension uses other Firebase and Google Cloud Platform services, which have associated charges if you exceed the service’s no-cost tier:

- Cloud Firestore
- Cloud Functions (Node.js 10+ runtime. [See FAQs](https://firebase.google.com/support/faq#extensions-pricing))
