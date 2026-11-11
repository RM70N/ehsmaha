// الحسابان الوحيدان. لا إنشاء حسابات، لا تسجيل، لا استعادة. المعرّفات ثابتة في الكود،
// وكلمات المرور مشتقات Argon2id تأتي من أسرار البيئة فقط (لا تُخزَّن ولا تُسجَّل).
import argon2 from 'argon2';

export const ACCOUNTS = Object.freeze({
  owner: Object.freeze({ key: 'owner', id: 'OWNER', display: 'المالك', role: 'owner' }),
  admin: Object.freeze({ key: 'admin', id: 'ADMIN', display: 'الأدمن', role: 'admin' })
});
export const accountById = (id) => Object.values(ACCOUNTS).find((a) => a.id === id) || null;

const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (pw) => argon2.hash(pw, OPTS);

export async function createCredentialVerifier(cfg) {
  const hashes = {
    owner: cfg.ownerHash || (cfg.ownerPlain ? await hashPassword(cfg.ownerPlain) : ''),
    admin: cfg.adminHash || (cfg.adminPlain ? await hashPassword(cfg.adminPlain) : '')
  };
  // تجزئة وهمية لتساوي زمن الرد عند حساب غير معروف/غير مُهيّأ (منع التعداد)
  const dummy = await hashPassword('dummy-' + Math.random());
  return {
    configured: { owner: !!hashes.owner, admin: !!hashes.admin },
    async verify(accountKey, password) {
      const h = (Object.hasOwn(hashes, accountKey) && hashes[accountKey]) || '';
      const pw = typeof password === 'string' && password.length <= 256 ? password : '';
      try {
        const ok = await argon2.verify(h || dummy, pw);
        return !!h && ok;
      } catch { return false; }
    }
  };
}
