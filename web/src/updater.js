// In-app updates from GitHub Releases.
// On Android the native side (UpdateManager.java) asks GitHub and downloads/installs the APK.
// In a desktop browser the check works through fetch so the UI can be developed without a phone.

export const REPO = 'jt-coder321/barrelstorm';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

const bridge = () => window.AndroidBridge || null;

export function isNative() {
  return !!bridge();
}

export function currentVersion() {
  const b = bridge();
  if (b) {
    try {
      return { name: b.getVersionName(), code: Number(b.getVersionCode()) };
    } catch (e) { /* fall through */ }
  }
  return { name: 'dev build', code: 0 };
}

// Pulls the build number out of a tag such as "v1.0.42" (the number after the last dot).
export function codeFromTag(tag) {
  const m = /(\d+)\s*$/.exec(String(tag || ''));
  return m ? Number(m[1]) : 0;
}

export function parseRelease(json) {
  const rel = typeof json === 'string' ? JSON.parse(json) : json;
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const apk = assets.find((a) => /\.apk$/i.test(a.name || ''));
  return {
    tag: rel.tag_name || '',
    name: rel.name || rel.tag_name || '',
    code: codeFromTag(rel.tag_name),
    notes: (rel.body || '').trim(),
    apk: apk
      ? {
        name: apk.name,
        url: apk.browser_download_url,
        size: apk.size || 0,
        sha256: typeof apk.digest === 'string' && apk.digest.startsWith('sha256:') ? apk.digest.slice(7) : '',
      }
      : null,
  };
}

let pending = null;

window.__bsRelease = (json) => {
  if (!pending) return;
  const p = pending;
  pending = null;
  try {
    p.resolve(parseRelease(json));
  } catch (e) {
    p.reject(new Error('Could not read the release information.'));
  }
};
window.__bsReleaseError = (msg) => {
  if (!pending) return;
  const p = pending;
  pending = null;
  p.reject(new Error(msg || 'Could not reach GitHub.'));
};

export function checkLatest() {
  const b = bridge();
  if (b && b.checkForUpdate) {
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      setTimeout(() => {
        if (pending && pending.resolve === resolve) {
          pending = null;
          reject(new Error('GitHub did not answer in time.'));
        }
      }, 25000);
      b.checkForUpdate(API);
    });
  }
  return fetch(API, { headers: { Accept: 'application/vnd.github+json' } }).then((r) => {
    if (r.status === 404) throw new Error('No release has been published yet.');
    if (!r.ok) throw new Error(`GitHub answered ${r.status}.`);
    return r.json().then(parseRelease);
  });
}

export function isNewer(release) {
  return !!release && release.code > currentVersion().code && !!release.apk;
}

// Starts download + install. Progress comes back through the handlers below.
export function installUpdate(release, handlers) {
  const b = bridge();
  if (!b || !b.downloadAndInstall) {
    handlers.onState('error', 'Installing updates only works inside the Android app.');
    return;
  }
  window.__bsDownloadProgress = (done, total) => handlers.onProgress(Number(done), Number(total));
  window.__bsDownloadState = (state, msg) => handlers.onState(state, msg || '');
  b.downloadAndInstall(release.apk.url, release.apk.name, release.apk.size || 0, release.apk.sha256 || '');
}
