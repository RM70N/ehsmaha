// ==================== نوافذ التنفيذ (Modal) ====================
// كل واحدة من الأزرار الـ450 تفتح نافذة/لوحة تنفيذ فعلية من هنا (بدل رسالة
// تنبيه فقط) — هذا الملف يوفّر ثلاث بنى جاهزة يعاد استخدامها بكل قسم:
// openModal (حاوية عامة)، openConfirm (تأكيد/تأكيد مزدوج للإجراءات الحسّاسة)،
// openFormModal (نموذج مولَّد من وصف حقول).
let stack = [];

// يُستخدم من أي معالج نقر مباشر (خارج openConfirm/openFormModal) قبل أي
// كتابة على Firestore — قسم 30.10 "وضع قراءة فقط".
export function isReadOnly() {
  return !!window.__adminReadOnly;
}

function trapFocus(el) {
  const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length) focusable[0].focus();
}

export function openModal({ title, bodyEl, size, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  const box = document.createElement('div');
  box.className = `admin-modal admin-modal--${size || 'md'}`;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');

  const head = document.createElement('div');
  head.className = 'admin-modal__head';
  const h = document.createElement('h3');
  h.textContent = title || '';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'admin-modal__close';
  closeBtn.setAttribute('aria-label', 'إغلاق');
  closeBtn.textContent = '×';
  head.appendChild(h);
  head.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'admin-modal__body';
  if (bodyEl) body.appendChild(bodyEl);

  box.appendChild(head);
  box.appendChild(body);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.body.classList.add('admin-modal-open');
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  trapFocus(box);

  function close() {
    overlay.classList.remove('is-visible');
    setTimeout(() => {
      overlay.remove();
      stack = stack.filter((s) => s !== api);
      if (!stack.length) document.body.classList.remove('admin-modal-open');
      if (onClose) onClose();
    }, 160);
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  function escHandler(e) { if (e.key === 'Escape' && stack[stack.length - 1] === api) close(); }
  document.addEventListener('keydown', escHandler);

  const api = { overlay, box, body, close };
  stack.push(api);
  return api;
}

export function openConfirm({ title, message, danger, doubleConfirm, confirmText, cancelText, onConfirm }) {
  const body = document.createElement('div');
  body.className = 'admin-confirm';
  const p = document.createElement('p');
  p.textContent = message || '';
  body.appendChild(p);

  let phraseInput = null;
  if (doubleConfirm) {
    const warn = document.createElement('p');
    warn.className = 'admin-confirm__warn';
    warn.textContent = 'إجراء لا يمكن التراجع عنه — اكتب "تأكيد" بالمربع أدناه للمتابعة.';
    body.appendChild(warn);
    phraseInput = document.createElement('input');
    phraseInput.className = 'admin-input';
    phraseInput.placeholder = 'تأكيد';
    body.appendChild(phraseInput);
  }

  const actions = document.createElement('div');
  actions.className = 'admin-modal__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'admin-btn admin-btn--ghost';
  cancelBtn.textContent = cancelText || 'إلغاء';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = `admin-btn ${danger ? 'admin-btn--danger' : 'admin-btn--primary'}`;
  okBtn.textContent = confirmText || 'تأكيد';
  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);
  body.appendChild(actions);

  const modal = openModal({ title: title || 'تأكيد الإجراء', bodyEl: body, size: 'sm' });
  cancelBtn.addEventListener('click', modal.close);
  okBtn.addEventListener('click', async () => {
    if (window.__adminReadOnly) {
      const errEl = document.createElement('p');
      errEl.className = 'admin-confirm__warn';
      errEl.textContent = 'اللوحة بوضع "قراءة فقط" حالياً — عطّله من قسم 30 لتنفيذ أي إجراء.';
      body.insertBefore(errEl, actions);
      return;
    }
    if (doubleConfirm && phraseInput.value.trim() !== 'تأكيد') {
      phraseInput.classList.add('is-invalid');
      return;
    }
    okBtn.disabled = true;
    okBtn.textContent = 'جارٍ التنفيذ...';
    try {
      await onConfirm();
      modal.close();
    } catch (err) {
      okBtn.disabled = false;
      okBtn.textContent = confirmText || 'تأكيد';
      const errEl = document.createElement('p');
      errEl.className = 'admin-confirm__warn';
      errEl.textContent = 'فشل التنفيذ: ' + (err && err.message ? err.message : 'خطأ غير معروف');
      body.insertBefore(errEl, actions);
    }
  });
  return modal;
}

// مولِّد نموذج عام: fields = [{ key, label, type: 'text'|'number'|'textarea'|'select'|'checkbox'|'date', value, required, options, placeholder, min, max }]
export function openFormModal({ title, fields, submitText, size, onSubmit }) {
  const form = document.createElement('form');
  form.className = 'admin-form';
  form.noValidate = true;

  const inputs = {};
  (fields || []).forEach((f) => {
    const wrap = document.createElement('label');
    wrap.className = 'admin-field';
    const cap = document.createElement('span');
    cap.className = 'admin-field__label';
    cap.textContent = f.label + (f.required ? ' *' : '');
    wrap.appendChild(cap);

    let input;
    if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = f.rows || 4;
    } else if (f.type === 'select') {
      input = document.createElement('select');
      (f.options || []).forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === f.value) opt.selected = true;
        input.appendChild(opt);
      });
    } else if (f.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!f.value;
      wrap.classList.add('admin-field--checkbox');
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      if (f.min != null) input.min = f.min;
      if (f.max != null) input.max = f.max;
      if (f.step != null) input.step = f.step;
    }
    input.className = input.className ? input.className : 'admin-input';
    if (f.placeholder) input.placeholder = f.placeholder;
    if (f.type !== 'checkbox' && f.value !== undefined && f.value !== null) input.value = f.value;
    if (f.required) input.required = true;
    if (f.disabled) input.disabled = true;
    wrap.appendChild(input);
    if (f.hint) {
      const hint = document.createElement('span');
      hint.className = 'admin-field__hint';
      hint.textContent = f.hint;
      wrap.appendChild(hint);
    }
    form.appendChild(wrap);
    inputs[f.key] = { el: input, type: f.type };
  });

  const statusEl = document.createElement('p');
  statusEl.className = 'admin-form__status';
  form.appendChild(statusEl);

  const actions = document.createElement('div');
  actions.className = 'admin-modal__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'admin-btn admin-btn--ghost';
  cancelBtn.textContent = 'إلغاء';
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'admin-btn admin-btn--primary';
  submitBtn.textContent = submitText || 'حفظ';
  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);
  form.appendChild(actions);

  const modal = openModal({ title, bodyEl: form, size: size || 'md' });
  cancelBtn.addEventListener('click', modal.close);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (window.__adminReadOnly) {
      statusEl.className = 'admin-form__status admin-form__status--err';
      statusEl.textContent = 'اللوحة بوضع "قراءة فقط" حالياً — عطّله من قسم 30 لتنفيذ أي إجراء.';
      return;
    }
    const values = {};
    let missing = false;
    Object.entries(inputs).forEach(([key, { el, type }]) => {
      if (type === 'checkbox') values[key] = el.checked;
      else if (type === 'number') values[key] = el.value === '' ? null : Number(el.value);
      else values[key] = el.value;
      if (el.required && type !== 'checkbox' && !String(el.value || '').trim()) missing = true;
    });
    if (missing) {
      statusEl.className = 'admin-form__status admin-form__status--err';
      statusEl.textContent = 'عبّي الحقول الإلزامية أول';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ الحفظ...';
    try {
      await onSubmit(values, modal);
      modal.close();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = submitText || 'حفظ';
      statusEl.className = 'admin-form__status admin-form__status--err';
      statusEl.textContent = 'فشل الحفظ: ' + (err && err.message ? err.message : 'خطأ غير معروف');
    }
  });

  return modal;
}

window.AdminModal = { openModal, openConfirm, openFormModal };
