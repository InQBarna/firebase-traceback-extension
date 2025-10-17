Traceback is a replacement of [Dynamic Links](https://firebase.google.com/support/dynamic-links-faq) which are being deprecated.

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
- Cloud Functions (Node.js 20 runtime. [See FAQs](https://firebase.google.com/support/faq#extensions-pricing))
