import test from 'node:test';
import assert from 'node:assert/strict';

function fakeNode() {
  const attributes = new Map(), listeners = new Map();
  return {
    attributes, listeners, dataset: {}, value: '', textContent: '', hidden: false, disabled: false, open: false,
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) {
      attributes.delete(name);
      if (name === 'aria-busy') this.taskFinished?.();
    },
    addEventListener(name, callback) { listeners.set(name, callback); },
    reportValidity() { return true; },
    focus() {},
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
}

function fakePage() {
  const ids = ['auth-notice', 'auth-dialog', 'auth-verify', 'auth-form', 'auth-reset', 'auth-email', 'auth-password', 'verification-email', 'email-signin', 'email-signup', 'resend-verification', 'check-verification', 'paste-verification-link', 'verification-signout', 'sign-out', 'email-link-help', 'email-action-mode', 'email-action-link', 'email-action-password-wrap', 'email-action-password', 'email-action-form', 'apply-email-link'];
  const nodes = new Map(ids.map(id => [id, fakeNode()]));
  const signIn = fakeNode(), welcome = fakeNode(), en = fakeNode(), zh = fakeNode();
  en.dataset.language = 'en'; zh.dataset.language = 'zh';
  const buttons = ['auth-reset', 'email-signin', 'email-signup', 'resend-verification', 'check-verification', 'paste-verification-link', 'verification-signout', 'apply-email-link'].map(id => nodes.get(id));
  nodes.get('auth-dialog').querySelectorAll = selector => selector === 'button' ? buttons : [];
  return {
    nodes, languageButtons: [en, zh],
    document: {
      documentElement: {}, visibilityState: 'visible',
      getElementById(id) {
        assert.ok(nodes.has(id), `Missing fake page element ${id}`);
        return nodes.get(id);
      },
      querySelectorAll(selector) {
        return selector === '.sign-in' ? [signIn] : selector === '[data-language]' ? [en, zh] : [];
      },
      querySelector(selector) { return selector === '[data-i18n="welcomeText"]' ? welcome : null; },
      addEventListener() {},
    },
  };
}

function browserHarness(t, verificationError = 'authUnavailable') {
  const page = fakePage(), originalGlobals = new Map(), storage = new Map(), intervals = [], calls = [];
  const hostile = 'private-password member@example.test secret-token https://attacker.invalid';
  const user = {id: 'firebase:member', email: 'member@example.test', emailVerified: false};
  const replace = (name, value) => {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
  };
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  const hasOwn = Object.getOwnPropertyDescriptor(Object, 'hasOwn');
  t.after(() => {
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    Object.defineProperty(AbortSignal, 'timeout', timeout);
    Object.defineProperty(Object, 'hasOwn', hasOwn);
  });
  replace('document', page.document);
  replace('localStorage', {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)});
  replace('location', {href: 'https://drfrog.example/', host: 'drfrog.example', pathname: '/'});
  replace('history', {replaceState() {}});
  replace('window', {addEventListener() {}});
  replace('setInterval', (callback, milliseconds) => { intervals.push({callback, milliseconds}); return intervals.length; });
  replace('fetch', async (url, init) => {
    calls.push({url, init});
    const result = url === '/api/auth-config' ? {provider: 'firebase', firebase: {authDomain: 'drfrog-test.firebaseapp.com', apiKey: 'public-test-key'}}
      : url === '/api/auth/session' ? {user: null}
      : url === '/api/auth/sign-up' ? {user, expiresIn: 3600}
      : url === '/api/auth/send-verification' ? {error: verificationError, diagnostic: {reason: 'providerNetwork', detail: hostile, code: hostile}}
      : null;
    if (result === null) throw new Error('Unexpected auth request');
    return {ok: url !== '/api/auth/send-verification', status: url === '/api/auth/send-verification' ? 503 : 200, json: async () => result};
  });
  Object.defineProperty(AbortSignal, 'timeout', {configurable: true, value: undefined});
  Object.defineProperty(Object, 'hasOwn', {configurable: true, value: undefined});
  return {page, calls, intervals, user, hostile};
}

async function clickSignup(page) {
  page.nodes.get('auth-email').value = ' member@example.test ';
  page.nodes.get('auth-password').value = 'private-password';
  const taskFinished = new Promise(resolve => { page.nodes.get('auth-dialog').taskFinished = resolve; });
  page.nodes.get('email-signup').onclick();
  await taskFinished;
}

test('real signup UI preserves the created account when verification delivery fails in an older browser', {timeout: 3000}, async t => {
  const {page, calls, intervals, user, hostile} = browserHarness(t);
  const auth = await import('../public/auth.js?ui=delivery-failed');
  const {copy, setLanguage} = await import('../public/i18n.js');
  setLanguage('en');
  let changes = 0;
  await auth.initAuth(() => { changes++; return new Promise(() => {}); });
  auth.openAuth();
  assert.equal(page.nodes.get('auth-dialog').open, true);
  await clickSignup(page);

  assert.deepEqual(calls.map(call => call.url), ['/api/auth-config', '/api/auth/session', '/api/auth/sign-up', '/api/auth/send-verification']);
  assert.equal(calls[0].init.cache, 'no-store');
  const signup = calls.find(call => call.url === '/api/auth/sign-up').init;
  assert.equal(signup.method, 'POST');
  assert.equal(signup.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(signup.body), {email: user.email, password: 'private-password', language: 'en'});
  assert.equal(changes, 0, 'An unrelated page refresh cannot block verification delivery');
  assert.equal(page.nodes.get('auth-password').value, '');
  assert.equal(page.nodes.get('auth-verify').hidden, false);
  assert.equal(page.nodes.get('auth-form').hidden, true);
  assert.equal(page.nodes.get('auth-reset').hidden, true);
  assert.equal(page.nodes.get('verification-email').textContent, user.email);
  assert.equal(page.nodes.get('auth-dialog').open, true);
  assert.equal(page.nodes.get('auth-dialog').attributes.has('aria-busy'), false);
  assert.equal(page.nodes.get('resend-verification').disabled, false);
  assert.equal(page.nodes.get('email-signup').disabled, false);
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].milliseconds, 1000);

  const notice = page.nodes.get('auth-notice');
  const reference = 'CG-SV-PROVIDER-NETWORK';
  assert.equal(notice.dataset.key, 'accountCreatedVerificationProblem');
  assert.equal(notice.dataset.reference, reference);
  assert.equal(notice.textContent, copy.accountCreatedVerificationProblem[0] + ' ' + copy.authErrorReference[0].replace('{code}', reference));
  for (const value of hostile.split(' ')) assert.ok(!notice.textContent.includes(value));

  setLanguage('zh');
  page.languageButtons[1].listeners.get('click')();
  assert.equal(notice.dataset.key, 'accountCreatedVerificationProblem');
  assert.equal(notice.dataset.reference, reference);
  assert.equal(notice.textContent, copy.accountCreatedVerificationProblem[1] + ' ' + copy.authErrorReference[1].replace('{code}', reference));
  assert.equal(page.nodes.get('auth-verify').hidden, false);
  assert.equal(calls.length, 4, 'Refreshing bilingual notice must not retry registration or delivery');
});

test('lost session during post-signup email request keeps sign-in recovery visible', {timeout: 3000}, async t => {
  const {page, calls, hostile} = browserHarness(t, 'signIn');
  const auth = await import('../public/auth.js?ui=session-lost');
  const {copy, setLanguage} = await import('../public/i18n.js');
  setLanguage('en');
  await auth.initAuth(async () => {});
  auth.openAuth();
  await clickSignup(page);

  const notice = page.nodes.get('auth-notice');
  const reference = 'CG-SV-PROVIDER-NETWORK';
  assert.equal(notice.dataset.key, 'accountCreatedSignin');
  assert.equal(notice.dataset.reference, reference);
  assert.equal(notice.textContent, copy.accountCreatedSignin[0] + ' ' + copy.authErrorReference[0].replace('{code}', reference));
  assert.equal(page.nodes.get('auth-verify').hidden, true);
  assert.equal(page.nodes.get('auth-form').hidden, false);
  assert.equal(page.nodes.get('auth-reset').hidden, false);
  assert.equal(page.nodes.get('auth-dialog').open, true);
  assert.equal(page.nodes.get('auth-email').value.trim(), 'member@example.test');
  assert.equal(page.nodes.get('auth-password').value, '');
  assert.equal(page.nodes.get('email-signin').disabled, false);
  assert.equal(page.nodes.get('auth-dialog').attributes.has('aria-busy'), false);
  for (const value of hostile.split(' ')) assert.ok(!notice.textContent.includes(value));
  assert.deepEqual(calls.map(call => call.url), ['/api/auth-config', '/api/auth/session', '/api/auth/sign-up', '/api/auth/send-verification']);

  setLanguage('zh');
  page.languageButtons[1].listeners.get('click')();
  assert.equal(notice.dataset.key, 'accountCreatedSignin');
  assert.equal(notice.dataset.reference, reference);
  assert.equal(notice.textContent, copy.accountCreatedSignin[1] + ' ' + copy.authErrorReference[1].replace('{code}', reference));
});
