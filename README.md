# Built.io Contentstack import tool

Built.io Contentstack is a headless CMS with an API-first approach that puts content at the centre. It is designed to simplify the process of publication by separating code from content.

This tool helps you to import content which is exported using contentstack-export utility into another stack. 

## Installation

Download this project and install all the modules using following command.

```bash
npm install
```

## Configuration

Update configuration details at config/index.json :

```
"email": <<YOUR EMAIL ADDRESS>>
"password" : <<PASSWORD>>
"source_stack" : <<SOURCE_STACK_API_KEY>>
"target_stack" : <<TARGET_STACK_API_KEY>>
"data": <<FOLDER PATH WHERE DATA IS EXPORTED>>
  ```
  
## Usage
  
Once all things are configured, you have to run following commands:
  
### Import all the modules :

  ```
  npm run import 
  ```
  
### Import specific module :
  
```
  npm run import <<module name>>
 ```
 
 Module names and sequence can be as follows:
 1. assets
 2. environments
 3. locales
 4. contentTypes
 5. entries
 
Note: Before importing entries, you must have to import locales, assets and content types.

### Known issues
* It will migrate only latest published version of entry.

## License
This project is licensed under MIT license
