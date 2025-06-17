# Contributing to Traceback

If you want to contribute or debug the extension we recommend:

1- Download the repository next to your test project
```bash
git clone git@github.com:InQBarna/firebase-traceback-extension.git traceback-extension
```
2.- Install locally using the CLI.

In order to load extension breakpoints correctly, we checkout the testing project inside 
the extension project. Can't get it working reversely, please let us know if you get it.

```bash
cd traceback-extension/functions/
ln -s ../../my-project/ my-project-tests
cd my-project-tests/functions
firebase ext:install ../../../
```
3.- Debug locally, usually with

```
firebase emulators:start --inspect-functions
```

4.- When ready, deploy
```bash
firebase deploy --only extensions
```

5.- When working locally, there are many hacks for the emulators to work. 
For example, working with local hosting is possible, but extension setup code
only works with the remote hosting api.
Serve a hosting by adding the hosting locally to your firebase configuration
firebase.json:

```
  "hosting": [
    {
      "site": "{projectName}}-traceback",
      "public": "public",
      "appAssociation": "NONE",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ],
      "rewrites": [
        {
          "source": "**",
          "function": "ext-traceback-dynamichostingcontent",
          "region": "europe-west1"
        }
      ]
    }
  ],
```

6.- When working, you can uninstall from source and proceed with normal installation

```bash
firebase ext:uninstall traceback-extension
firebase ext:install traceback-extension
```