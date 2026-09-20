// ==================== أدوات تنسيق + تصدير مشتركة ====================
// تُستخدم من كل الأقسام: تنسيق تاريخ/رقم، تصدير CSV، وتصدير "PDF" عبر
// صفحة طباعة (window.print) — يشتغل بكل متصفح بدون أي مكتبة PDF إضافية،
// والمستخدم يختار "حفظ كـPDF" من نافذة الطباعة نفسها.
export function fmtDate(ts) {
  let d = null;
  if (ts && typeof ts.toDate === 'function') d = ts.toDate();
  else if (ts instanceof Date) d = ts;
  else if (typeof ts === 'number') d = new Date(ts);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtNum(n) {
  return new Intl.NumberFormat('ar').format(n || 0);
}

export function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  return 0;
}

export function csvDownload(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function printReport(title, bodyHtml) {
  const win = window.open('', '_blank');
  if (!win) { alert('المتصفح منع فتح نافذة جديدة — فعّل النوافذ المنبثقة لهذا الموقع'); return; }
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 28px; color: #201235; }
      h1 { color: #6b3fa0; font-size: 20px; margin-bottom: 4px; }
      .meta { color: #666; font-size: 12px; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: right; font-size: 12.5px; }
      th { background: #f1e9fa; }
      h2 { font-size: 14px; color: #6b3fa0; margin-top: 22px; }
    </style>
  </head><body>
    <h1>${title}</h1>
    <div class="meta">تاريخ التصدير: ${new Date().toLocaleString('ar-SA')}</div>
    ${bodyHtml}
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}
