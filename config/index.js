/* eslint-disable no-dupe-keys */
module.exports = {
  versioning: false,
  host: 'https://api.contentstack.io/v3',
  modules: {
    types: [
      'assets',
      'locales',
      'environments',
      'extensions',
      'webhooks',
      'global_fields',
      'content_types',
      'entries',
      'labels'
    ],
    locales: {
      dirName: 'locales',
      fileName: 'locales.json',
      requiredKeys: [Array]
    },
    environments: { dirName: 'environments', fileName: 'environments.json' },
    labels: { dirName: 'labels', fileName: 'labels.json' },
    extensions: { dirName: 'extensions', fileName: 'extensions.json' },
    webhooks: { dirName: 'webhooks', fileName: 'webhooks.json' },
    assets: {
      dirName: 'assets',
      fileName: 'assets.json',
      limit: 100,
      host: 'https://api.contentstack.io',
      validKeys: [Array],
      assetBatchLimit: 5
    },
    content_types: {
      dirName: 'content_types',
      fileName: 'content_types.json',
      validKeys: [Array],
      limit: 100
    },
    entries: {
      dirName: 'entries',
      fileName: 'entries.json',
      invalidKeys: [Array],
      limit: 50,
      assetBatchLimit: 5
    },
    globalfields: {
      dirName: 'global_fields',
      fileName: 'globalfields.json',
      validKeys: [Array],
      limit: 100
    },
    stack: { dirName: 'stack', fileName: 'stack.json' }
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
  configUrl: '',
  authtoken: '***REMOVED***',
  headers: {
    authtoken: '***REMOVED***',
    api_key:'blt8f3e0aa94fe4930b',
    access_token: 'bltba631263d6472cb1',
    'X-User-Agent': 'contentstack-import/v1.5.0'
  },
  useBackedupDir: '',
  master_locale: {
    // master locale of the stack
    name: 'English - United States',
    code: 'en-us'
  },
  data:'./contents_new'
};
