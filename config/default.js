module.exports = {
  versioning: false,
  // pass locale, only to migrate entries from that locale
  // not passing `locale` will migrate all the locales present
  // locales: ['fr-fr'],
  host: 'https://api.contentstack.io/v3',
  modules: {
    types: [
      'locales',
      'environments',
      'extensions',
      'webhooks',
      'global_fields',
      'assets',
      'content_types',
      'entries',
      'labels'
    ],
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
    labels: {  
      dirName: 'labels',
      fileName: 'labels.json'
    },
    extensions: {
      dirName: 'extensions',
      fileName: 'extensions.json'
    },
    webhooks: {
      dirName: 'webhooks',
      fileName: 'webhooks.json'
    },
    assets: {
      dirName: 'assets',
      fileName: 'assets.json',
      // This is the total no. of asset objects fetched in each 'get assets' call
      limit: 100,
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
      limit: 50,
      assetBatchLimit: 5
    },

    globalfields: {
      dirName: 'global_fields',
      fileName: 'globalfields.json',
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
    stack: {
      dirName: 'stack',
      fileName: 'stack.json'
    }
  },
  apis: {
    userSession: '/user-session/',
    locales: '/locales/',
    environments: '/environments/',
    assets: '/assets/',
    content_types: '/content_types/',
    entries: '/entries/',
    extensions: '/extensions/',
    webhooks: '/webhooks/',
    globalfields: '/global_fields/',
    folders: '/folders/',
    stacks: '/stacks/',
    labels: '/labels/'
  },
  preserveStackVersion: false,
  entriesPublish: false,
  concurrency: 1
  // , useBackedupDir: './_backup_878'
  // is the no. of files to be copied/backed up concurrently
  // backupConcurrency: 10,
};
