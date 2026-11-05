// يستبدل fetch لنداء identitytoolkit فقط: توكن 'owner-token' ⇒ حساب المالك، 'user-token' ⇒ مستخدم عادي، غيره ⇒ فشل.
const real = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('identitytoolkit.googleapis.com/v1/accounts:lookup')) {
    const tok = JSON.parse(opts.body).idToken;
    const users = { 'owner-token': { localId: 'uidOwner', email: 'malshaifan1@gmail.com' }, 'user-token': { localId: 'uidUser', email: 'someone@x.com' } };
    const u = users[tok];
    return new Response(JSON.stringify(u ? { users: [u] } : { error: { message: 'INVALID_ID_TOKEN' } }), { status: u ? 200 : 400, headers: { 'content-type': 'application/json' } });
  }
  if (String(url).startsWith('https://api.github.com/')) return new Response(JSON.stringify([{ tag_name: 'v1.1.3', assets: [{ name: 'ehsmaha-setup.exe', download_count: 5 }] }]), { status: 200, headers: { 'content-type': 'application/json' } });
  return real(url, opts);
};
