# Contentstack import utility

Contentstack is a headless CMS with an API-first approach that puts content at the centre. It is designed to simplify the process of publication by separating code from content.

This tool helps you to import content which is exported using contentstack-export utility into another stack. 

## Installation
Download this project and install all the modules using following command.
```bash
npm install
```

## Configuration
Update configuration details at config/index.js
```js
'master_locale': 
 {
  'name': << your stack master locale >>,  // ex: 'English - United States'
  'code': << stack master locale code >> // ex: 'en-us'
 }
'email': << your registered e-mail address >>
'password': << your account passwd >>
'target_stack': << stack api key >> // the stack where the contents will be imported
'data': << location of the exported content >> // ex: './_content'
  ```
## Usage
Once all things are configured, you have to run following commands

### Import all the modules
```bash
npm run import 
```

### Import specific modules
```bash
npm run import assets
npm run import locales
npm run import env
npm run import contenttypes
npm run import entries
```
> Note: Before importing entries you must have to import locales, assets and content types.

### Known issues
* It will migrate only latest published version of entry.
* Does not support exporting Contentstack's Releases and Extensions
* If 2 different versions of the same asset have the same file name, only the 1st imported will be imported

## License
This project is licensed under MIT license
