module.exports = {
  master_locale: { // master locale of the stack
    name: 'Spain',
    code: 'es-es' // mandatory
  },
  // pass locale, only to migrate entries from that locale
  // not passing `locale` will migrate all the locales present
  // locales: ['fr-fr'],
  versioning: true,
  email: '',
  password: '',
  target_stack: '',
  // Folder to which contents are to be imported
  data: './_contents',
  // host endpoint
  host: 'api.contentstack.io',
  // CDN endpoint
  // cdn: 'cdn.contentstack.io',
  // port to connect at endpoint
  port: '443',
  // stack version
  api_version: 'v3',
  // if exisstingContentDir exists, no backup folder will be created
  // rather, its value(path) will be used instead
  // useBackedupDir: './_backup_694',
  // is the no. of files to be copied/backed up concurrently
  // backupConcurrency: 10,
  modules: {
    locales: {
      dirName: 'locales',
      fileName: 'locales.json',
      requiredKeys: [
        'code',
        'uid',
        'name'
      ]
    },
    environments: {
      dirName: 'environments',
      fileName: 'environments.json'
    },
    assets: {
      dirName: 'assets',
      fileName: 'assets.json',
      // This is the total no. of asset objects fetched in each 'get assets' call
      limit: 100,
      // @todo
      host: 'https://api.contentstack.io',
      validKeys: [
        'uid',
        'filename',
        'url',
        'status'
      ],
      assetBatchLimit: 5
    },
    content_types: {
      dirName: 'content_types',
      fileName: 'content_types.json',
      validKeys: [
        'title',
        'uid',
        'schema',
        'options',
        'singleton',
        'description'
      ],
      limit: 100
    },
    entries: {
      dirName: 'entries',
      fileName: 'entries.json',
      invalidKeys: [
        'created_at',
        'updated_at',
        'created_by',
        'updated_by',
        '_metadata',
        'published'
      ],
      // @todo
      limit: 50
    }
  },
  apis: {
    userSession: '/user-session/',
    locales: '/locales/',
    environments: '/environments/',
    assets: '/assets/',
    content_types: '/content_types/',
    entries: '/entries/',
    folders: '/folders/'
  }
};
