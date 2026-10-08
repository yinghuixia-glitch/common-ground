import test from 'node:test';
import assert from 'node:assert/strict';
import {authRequest, registrationVerification, safeAuthReference} from '../public/auth-request.js';

const credentials = {email: 'member@example.test', password: 'a-private-password-123'};
const hostile = 'secret-token a-private-password-123 member@example.test https://attacker.invalid';
const referencePattern = /^CG-(SU|SI|SV|SR|VE|RP|SE|SO)-(NETWORK|TIMEOUT|RESPONSE|BROWSER|PROVIDER-NETWORK|PROVIDER-REDIRECT|PROVIDER-RESPONSE|PROVIDER-REQUEST|SESSION|SERVER)$/;

function timers() {
  const scheduled = [], cleared = [];
  return {
    scheduled, cleared,
    setTimer(callback, milliseconds) {
      const handle = {callback, milliseconds};
      scheduled.push(handle);
      return handle;
    },
    clearTimer(handle) { cleared.push(handle); },
  };
}

function options(fetcher, clock = timers()) {
  return {fetcher, Controller: AbortController, setTimer: clock.setTimer, clearTimer: clock.clearTimer};
}

function response(value, ok = true) {
  return {ok, status: ok ? 200 : 503, json: async () => value};
}

async function failure(work) {
  let caught;
  try { await work(); } catch (error) { caught = error; }
  assert.ok(caught instanceof Error, 'The request must reject with a safe Error');
  return caught;
}

function safeError(error, key, reference) {
  assert.equal(error.message, key);
  if (reference) assert.equal(error.reference, reference);
  assert.match(error.reference, referencePattern);
  for (const field of ['cause', 'diagnostic', 'data', 'response', 'firebaseCode', 'raw']) {
    assert.equal(error[field], undefined, `${field} must not expose a provider response`);
  }
  const printable = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
  for (const value of hostile.split(' ')) assert.ok(!printable.includes(value), `Error exposed ${value}`);
}

test('successful account requests send credentials to the same-origin endpoint once', async () => {
  const clock = timers(), calls = [];
  const value = {user: {id: 'firebase:member', email: credentials.email, emailVerified: false}, expiresIn: 3600};
  const result = await authRequest('sign-up', {...credentials, language: 'en'}, 'zh', options(async (url, init) => {
    calls.push({url, init});
    return response(value);
  }, clock));
  assert.deepEqual(result, value);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/auth/sign-up');
  const init = calls[0].init;
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'same-origin');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.headers['X-Common-Ground'], '1');
  assert.deepEqual(JSON.parse(init.body), {...credentials, language: 'zh'});
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.signal.aborted, false);
  assert.equal(clock.scheduled.length, 1);
  assert.equal(clock.scheduled[0].milliseconds, 35000);
  assert.deepEqual(clock.cleared, clock.scheduled);
});

test('account transport works when newer AbortSignal.timeout and Object.hasOwn APIs are absent', async () => {
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  const hasOwn = Object.getOwnPropertyDescriptor(Object, 'hasOwn');
  Object.defineProperty(AbortSignal, 'timeout', {configurable: true, value: undefined});
  Object.defineProperty(Object, 'hasOwn', {configurable: true, value: undefined});
  try {
    const result = await authRequest('session', {}, 'en', options(async () => response({user: null})));
    assert.deepEqual(result, {user: null});
    const error = await failure(() => authRequest('sign-in', credentials, 'en', options(async () => response({error: 'invalidCredentials'}, false))));
    safeError(error, 'invalidCredentials');
  } finally {
    Object.defineProperty(AbortSignal, 'timeout', timeout);
    Object.defineProperty(Object, 'hasOwn', hasOwn);
  }
});

test('fetch failures distinguish an unconfirmed registration and never retry the write', async () => {
  for (const [action, key] of [['sign-up', 'registrationUnconfirmed'], ['sign-in', 'authConnectionProblem']]) {
    const clock = timers(); let calls = 0;
    const error = await failure(() => authRequest(action, credentials, 'en', options(async () => {
      calls++;
      throw Object.assign(new Error(hostile), {name: 'FirebaseError', firebaseCode: hostile});
    }, clock)));
    safeError(error, key);
    assert.equal(calls, 1);
    assert.deepEqual(clock.cleared, clock.scheduled);
  }
});

test('a deadline aborts a pending registration once and reports an ambiguous result', async () => {
  const clock = timers(); let calls = 0, signal;
  const pending = authRequest('sign-up', credentials, 'en', options(async (_url, init) => {
    calls++; signal = init.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(hostile), {name: 'AbortError'})), {once: true}));
  }, clock));
  assert.equal(clock.scheduled.length, 1);
  clock.scheduled[0].callback();
  const error = await failure(() => pending);
  safeError(error, 'registrationUnconfirmed', 'CG-SU-TIMEOUT');
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.deepEqual(clock.cleared, clock.scheduled);
});

test('the deadline remains active while the response body is being decoded', async () => {
  const clock = timers(); let calls = 0, decoding = false, signal;
  const pending = authRequest('sign-up', credentials, 'en', options(async (_url, init) => {
    calls++; signal = init.signal;
    return {ok: true, status: 200, json() {
      decoding = true;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(hostile), {name: 'AbortError'})), {once: true}));
    }};
  }, clock));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(decoding, true);
  assert.deepEqual(clock.cleared, []);
  clock.scheduled[0].callback();
  const error = await failure(() => pending);
  safeError(error, 'registrationUnconfirmed', 'CG-SU-TIMEOUT');
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
  assert.deepEqual(clock.cleared, clock.scheduled);
});

test('unreadable successful registration responses do not cause a second account creation', async () => {
  const clock = timers(); let calls = 0;
  const error = await failure(() => authRequest('sign-up', credentials, 'en', options(async () => {
    calls++;
    return {ok: true, status: 200, json: async () => { throw new SyntaxError(hostile); }};
  }, clock)));
  safeError(error, 'registrationUnconfirmed', 'CG-SU-RESPONSE');
  assert.equal(calls, 1);
  assert.deepEqual(clock.cleared, clock.scheduled);
});

test('invalid JSON values are rejected safely instead of becoming a successful registration', async () => {
  for (const value of [null, 'ok', true, 1, []]) {
    const clock = timers(); let calls = 0;
    const error = await failure(() => authRequest('sign-up', credentials, 'en', options(async () => {
      calls++; return response(value);
    }, clock)));
    safeError(error, 'registrationUnconfirmed', 'CG-SU-RESPONSE');
    assert.equal(calls, 1);
    assert.deepEqual(clock.cleared, clock.scheduled);
  }
});

test('known backend error keys keep their distinct user guidance without retries', async () => {
  for (const key of ['invalidCredentials', 'emailInUse', 'invalidInput', 'weakPassword', 'tooFast', 'authTooFast', 'emailLinkInvalid', 'emailDeliveryLimited', 'signIn', 'verifyEmail', 'notFound', 'badOrigin', 'tooLarge', 'authUnavailable', 'accountCreatedSignin']) {
    const clock = timers(); let calls = 0;
    const error = await failure(() => authRequest('sign-up', credentials, 'en', options(async () => {
      calls++;
      return response({error: key, diagnostic: {reason: 'providerRejected', detail: hostile, code: hostile}}, false);
    }, clock)));
    safeError(error, key, 'CG-SU-PROVIDER-REQUEST');
    assert.equal(calls, 1);
    assert.deepEqual(clock.cleared, clock.scheduled);
  }
});

test('hostile provider error values and diagnostics cannot enter displayed errors', async () => {
  for (const value of [hostile, '__proto__', 'constructor', 'toString', {message: hostile}, null]) {
    let calls = 0;
    const error = await failure(() => authRequest('sign-up', credentials, 'zh', options(async () => {
      calls++;
      return response({error: value, diagnostic: {reason: hostile, detail: hostile, code: hostile, reference: hostile}}, false);
    })));
    safeError(error, 'authUnavailable', 'CG-SU-SERVER');
    assert.equal(calls, 1);
  }
});

test('malformed identity responses fail closed while an anonymous session stays valid', async () => {
  for (const action of ['sign-in', 'sign-up', 'session']) {
    for (const value of [{}, {user: {}}, {user: 'member'}, {user: {id: 7, email: credentials.email, emailVerified: true}}, {user: {id: 'member', email: 7, emailVerified: true}}, {user: {id: 'member', email: credentials.email, emailVerified: 'true'}}, ...(action === 'session' ? [] : [{user: null}])]) {
      const error = await failure(() => authRequest(action, credentials, 'en', options(async () => response(value))));
      safeError(error, action === 'sign-up' ? 'registrationUnconfirmed' : 'authResponseProblem');
    }
  }
  assert.deepEqual(await authRequest('session', {}, 'en', options(async () => response({user: null}))), {user: null});
});

test('diagnostic reasons map only to fixed references and ignore arbitrary provider details', async () => {
  const mappings = {
    providerNetwork: 'PROVIDER-NETWORK', providerRedirectRejected: 'PROVIDER-REDIRECT',
    providerInvalidResponse: 'PROVIDER-RESPONSE', providerRejected: 'PROVIDER-REQUEST',
    signupSessionIncomplete: 'SESSION',
  };
  for (const [reason, suffix] of Object.entries(mappings)) {
    let calls = 0;
    const error = await failure(() => authRequest('sign-up', credentials, 'en', options(async () => {
      calls++;
      return response({error: 'authUnavailable', diagnostic: {reason, detail: hostile, code: hostile, status: hostile}}, false);
    })));
    safeError(error, ['providerNetwork', 'providerInvalidResponse'].includes(reason) ? 'registrationUnconfirmed' : 'authUnavailable', 'CG-SU-' + suffix);
    assert.equal(calls, 1, 'A provider failure must never trigger another signup');
  }
  for (const reason of ['constructor', '__proto__', 'toString', hostile, null, 7, {toString: hostile, valueOf: hostile}]) {
    const error = await failure(() => authRequest('sign-up', credentials, 'en', options(async () => response({error: 'authUnavailable', diagnostic: {reason}}, false))));
    safeError(error, 'authUnavailable', 'CG-SU-SERVER');
  }
});

test('verification checks receive a longer deadline without extending other sessions', async () => {
  for (const [data, milliseconds] of [[{verificationCheck: true}, 65000], [{}, 35000], [{verificationCheck: false}, 35000], [{verificationCheck: 'true'}, 35000]]) {
    const clock = timers();
    await authRequest('session', data, 'en', options(async () => response({user: null}), clock));
    assert.equal(clock.scheduled[0].milliseconds, milliseconds);
    assert.deepEqual(clock.cleared, clock.scheduled);
  }
});

test('unsupported browser cancellation reports a safe error before sending credentials', async () => {
  let calls = 0;
  const clock = timers();
  const error = await failure(() => authRequest('sign-up', credentials, 'en', {...options(async () => { calls++; }, clock), Controller: undefined}));
  safeError(error, 'authBrowserUnsupported', 'CG-SU-BROWSER');
  assert.equal(calls, 0);
  assert.deepEqual(clock.scheduled, []);
});

test('unknown auth actions cannot turn the browser transport into an arbitrary request', async () => {
  for (const action of ['../../attacker.invalid', 'config', '__proto__', 'constructor']) {
    let calls = 0;
    const error = await failure(() => authRequest(action, credentials, 'en', options(async () => { calls++; })));
    assert.equal(error.message, 'invalidInput');
    assert.equal(calls, 0);
  }
});

test('verification delivery success preserves its return value and sends only once', async () => {
  let calls = 0;
  const result = await registrationVerification(async () => { calls++; return {ok: true}; });
  assert.deepEqual(result, {ok: true});
  assert.equal(calls, 1);
});

test('failure after account creation has separate verification guidance and a safe reference', async () => {
  let calls = 0;
  const error = await failure(() => registrationVerification(async () => {
    calls++;
    throw Object.assign(new Error(hostile), {reference: 'CG-SV-PROVIDER-NETWORK', cause: new Error(hostile), diagnostic: {detail: hostile}});
  }));
  safeError(error, 'accountCreatedVerificationProblem', 'CG-SV-PROVIDER-NETWORK');
  assert.equal(calls, 1);
});

test('a lost session after account creation tells the member to sign in before requesting email', async () => {
  let calls = 0;
  const error = await failure(() => registrationVerification(async () => {
    calls++;
    throw Object.assign(new Error('signIn'), {reference: 'CG-SV-PROVIDER-REQUEST', diagnostic: {detail: hostile}});
  }));
  safeError(error, 'accountCreatedSignin', 'CG-SV-PROVIDER-REQUEST');
  assert.equal(calls, 1);
});

test('verification failures never copy an arbitrary provider reference or raw rejection', async () => {
  for (const thrown of [Object.assign(new Error(hostile), {reference: hostile}), {message: hostile, reference: 'CG-SV-NETWORK\n' + hostile}, {reference: 'CG-ZZ-NETWORK'}, {reference: 'CG-SV-PRIVATE-TOKEN'}, hostile, null]) {
    const error = await failure(() => registrationVerification(async () => { throw thrown; }));
    assert.equal(error.message, 'accountCreatedVerificationProblem');
    assert.equal(error.cause, undefined);
    assert.equal(error.diagnostic, undefined);
    assert.ok(error.reference === undefined || error.reference === '' || referencePattern.test(error.reference));
    const printable = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
    for (const value of hostile.split(' ')) assert.ok(!printable.includes(value));
  }
});

test('support references reject terminal newlines and preserve only exact fixed codes', () => {
  assert.equal(safeAuthReference('CG-SV-PROVIDER-NETWORK'), 'CG-SV-PROVIDER-NETWORK');
  for (const value of ['CG-SV-NETWORK\n', 'CG-SV-NETWORK\r\n', ' CG-SV-NETWORK', 'CG-SV-NETWORK ', 'CG-SV-PRIVATE-TOKEN', 'CG-ZZ-NETWORK', null, 7]) {
    assert.equal(safeAuthReference(value), '');
  }
});
