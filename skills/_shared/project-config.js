'use strict';

const { STYLES, CHOICES, MODES, BANDS, PREVIZ_RENDERERS } = require('../storyboard/references/production-mode.js');
const { FORMATS } = require('../platform-guide/references/formats.js');
const PLATFORMS = ['threads', 'instagram', 'facebook', 'youtube'];
const TOKEN_FILES = { threads: 'threads_token', instagram: 'instagram_token', facebook: 'facebook_page_token', youtube: 'youtube-oauth-client.json' };
const PROJECT_FIELDS = ['project', 'style', 'production', 'sns'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && !!value.trim();

function keys(value, allowed, label) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`Invalid ${label} fields; credentials must stay outside project settings`);
}

function credentialRef(channel, platform) {
  return '${SNS_TOKEN_DIR}/' + channel + '/' + TOKEN_FILES[platform];
}

function validateProjectFields(config) {
  if (config.project !== undefined) {
    keys(config.project, ['name', 'channel'], 'project');
    if (!text(config.project.name) || !SLUG.test(config.project.channel || '')) throw new Error('project requires name and a channel slug (1–64 lowercase letters, digits or hyphens)');
  }
  if (config.style !== undefined) {
    keys(config.style, ['preset', 'reference', 'world', 'materials', 'palette', 'lighting', 'camera'], 'style');
    if (!Object.hasOwn(STYLES, config.style.preset || '')) throw new Error('Choose a supported style.preset');
    if (Object.values(config.style).some(value => !text(value))) throw new Error('Style values must be nonempty text');
  }
  if (config.production !== undefined) {
    keys(config.production, ['mode', 'renderRatioVersion', 'format', 'previzRenderer', 'episodeBudgetUsd'], 'production');
    const p = config.production;
    if (!CHOICES.includes(p.mode) || p.renderRatioVersion !== 1) throw new Error('Choose one of the six production modes and renderRatioVersion:1');
    if (!Object.hasOwn(FORMATS, p.format || '')) throw new Error('Choose a supported production.format');
    if (p.previzRenderer !== undefined && !Object.hasOwn(PREVIZ_RENDERERS, p.previzRenderer)) throw new Error('Invalid production.previzRenderer');
    if (p.episodeBudgetUsd !== undefined && (typeof p.episodeBudgetUsd !== 'number' || !Number.isFinite(p.episodeBudgetUsd) || p.episodeBudgetUsd < 0)) throw new Error('episodeBudgetUsd must be a finite nonnegative number');
  }
  if (config.sns !== undefined) {
    keys(config.sns, PLATFORMS, 'sns');
    for (const platform of PLATFORMS) {
      const account = config.sns[platform];
      keys(account, ['enabled', 'status', 'accountId', 'handle', 'checkedAt', 'credentialRef'], `sns.${platform}`);
      if (typeof account.enabled !== 'boolean' || !['pending', 'connected', 'disabled'].includes(account.status)) throw new Error(`Invalid sns.${platform} enabled/status`);
      if ((account.status === 'disabled') !== !account.enabled) throw new Error(`sns.${platform} disabled status must match enabled:false`);
      for (const key of ['accountId', 'handle', 'checkedAt']) {
        if (account[key] !== undefined && !text(account[key])) throw new Error(`Invalid sns.${platform}.${key}`);
      }
      if (account.checkedAt !== undefined && !Number.isFinite(Date.parse(account.checkedAt))) throw new Error(`Invalid sns.${platform}.checkedAt`);
      if (account.status === 'connected' && (!text(account.accountId) || !text(account.checkedAt))) throw new Error(`Connected sns.${platform} requires the verified accountId and checkedAt`);
      if (!config.project || account.credentialRef !== credentialRef(config.project.channel, platform)) throw new Error(`sns.${platform}.credentialRef must reference the channel's external token file`);
    }
  }
  return config;
}

function missingProjectFields(config) {
  return ['videoType', 'models', ...PROJECT_FIELDS].filter(key => config?.[key] === undefined);
}

function options() {
  return {
    styles: Object.entries(STYLES).map(([id, value]) => ({ id, ...value })),
    productionModes: CHOICES.map(id => ({ id, label: MODES[id], percentBand: BANDS[id], upperExclusive: !['full_video', 'no_video'].includes(id) })),
    formats: Object.keys(FORMATS), previzRenderers: PREVIZ_RENDERERS, platforms: PLATFORMS,
  };
}

module.exports = { PROJECT_FIELDS, PLATFORMS, SLUG, credentialRef, validateProjectFields, missingProjectFields, options };
