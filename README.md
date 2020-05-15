# Contentstack import utility

Contentstack is a headless CMS with an API-first approach that puts content at the centre. It is designed to simplify the process of publication by separating code from content.

This tool helps you to import content which is exported using [contentstack-export](https://github.com/contentstack/contentstack-export) utility into another stack. 

## Installation
Download this project and install all the modules using following command.

```bash
$ npm install
```

## Configuration
Update configuration details at config/index.js

```js
{
 master_locale: {
  name: '', // Stack's master locale. ex: 'English - United States'
  code: ''  // Stack master locale's code. ex: 'en-us'
 },
 email: '', // Your registered email id
 password: '', // Account password
 target_stack: '', // Stack api_key. This is the stack, where the data will be imported
 management_token: '' //Stack management_token
 data: '' // The data that's to be exported. This is generally the one exported via the contentstack-export utility. ex: '../contentstack-export/contents'. Kindly provide the relative path to the directory
```

## Usage
Once all things are configured, you can run following commands

1. Import all modules [ assets, locales, environments, extensions, webhooks, global_fields, content_types, entries, labels ]
```bash
$ npm run import
```

2. Import a specific module
```bash
$ npm run import-locales
$ npm run import-env
$ npm run import-extensions
$ npm run import-webhooks
$ npm run import-globalfields
$ npm run import-assets
$ npm run import-contenttypes
$ npm run import-entries
$ npm run import-labels

```
> Note: Before importing entries you must have to import locales, assets and content types.

> Note: If you keep the value of preserveStackVersion to true, then you will have to provide the email and password mandatorily in the config file, the management token will not work in that case

### Known Limitations and Issues
* It will migrate only latest published version of entry.
* Does not support the following
  * Roles
  * Users
  * Releases
  * Workflow
* If 2 different versions of the same asset have the same file name, only the 1st version will be imported

## License
This project is licensed under MIT license
