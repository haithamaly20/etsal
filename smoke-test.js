// اختبار تشغيلي للتطبيق في بيئة DOM حقيقية (jsdom) مع IndexedDB وهمية
// تشغيل: npm i jsdom fake-indexeddb && node smoke-test.js contacts-manager-v5.html
const fs = require('fs'), path = require('path');
const {JSDOM, VirtualConsole} = require('jsdom');
const fake = require('fake-indexeddb');
const file = process.argv[2] || path.join(__dirname, 'contacts-manager-v5.html');
const html = fs.readFileSync(file, 'utf8');

const CSV = `Name,Phone 1,Email 1
أحمد علي,01012345678,a@x.com
احمد علي,+20 10 1234 5678,
فاطمة محمد,01100000001,
فاطمه محمد,,f@x.com
علي محمود,01200000000,
محمد علي,01000000001,
محمود علي,01000000002,`;

let confirmAnswer = true;
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));

function boot() {
  return new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/', virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = fake.indexedDB; w.IDBKeyRange = fake.IDBKeyRange;
      w.alert = () => {}; w.confirm = () => confirmAnswer; w.prompt = () => 'عائلة';
      w.HTMLElement.prototype.showModal = function () { this.open = true; };
      w.HTMLElement.prototype.close = function () { this.open = false; };
      w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
    }
  }).window;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`}`);
};

(async () => {
  const w = boot();
  await wait(300);

  confirmAnswer = true;                       // تخطي المكررات
  w.eval(`importText(${JSON.stringify(CSV)}, false)`);
  check('استيراد: يتخطى المكرر داخل الملف (5 من 7)', w.eval('contacts.length'), 5);

  w.eval(`importText(${JSON.stringify(CSV)}, false)`);
  check('إعادة الاستيراد: لا يضيف مكررات', w.eval('contacts.length'), 5);

  confirmAnswer = false;                      // استيراد الكل
  w.eval(`importText(${JSON.stringify(CSV)}, false)`);
  check('استيراد الكل: 5 + 7 = 12', w.eval('contacts.length'), 12);
  check('الاسم الأصلي لم يتغير', w.eval("contacts.some(c => c.data.Name === 'احمد علي')"), true);
  check('تشابه إملائي مكتشف (محمد/محمود)', w.eval("fuzzy.has(compactKey('محمد علي'))"), true);
  check('مكرر محتمل مكتشف', w.eval("statusOf(contacts.find(c => nameOf(c) === 'احمد علي'))"), 'dup');
  check('المجموعات: إضافة المحدد إلى مجموعة', w.eval("selected = new Set(contacts.slice(0, 2).map(c => c.id)); groupBulk(true); contacts.filter(c => groupsOf(c).includes('عائلة')).length"), 2);
  check('الترتيب بالاسم يعطي قائمة مرتبة', w.eval("const l = contacts.slice().sort(SORTS.name_asc); l.every((c, i) => i === 0 || nameOf(l[i-1]).localeCompare(nameOf(c), 'ar') <= 0)"), true);
  check('الترتيب بالأحدث يضع الأحدث أولًا', w.eval("const l = contacts.slice().sort(SORTS.newest); l.every((c, i) => i === 0 || createdOf(l[i-1]) >= createdOf(c))"), true);
  w.eval('selected.clear()');
  check('مقارنة الجهتين تعرض سبب التشابه (رقم مشترك)', w.eval("openCompare(contacts.find(c => c.key === compactKey('احمد علي')), contacts.filter(c => c.key === compactKey('احمد علي'))[1]); $('cmpBody').innerHTML.includes('رقم هاتف مشترك')"), true);
  check('العرض لا يعرض الحقول الفارغة', w.eval("editMode = false; current = contacts[0]; renderEditor(); [...$('editor').querySelectorAll('dd')].every(d => d.textContent.trim() !== '')"), true);

  w.eval("selected = new Set(contacts.filter(c => c.key === compactKey('احمد علي')).map(c => c.id)); mergeSelected();");
  check('الدمج يفتح المعاينة ولا يحذف قبل التأكيد', [w.eval('$("mergeDlg").open'), w.eval('contacts.length')], [true, 12]);
  w.eval('confirmMerge();');
  check('بعد التأكيد: 3 سجلات متطابقة تصبح سجلًا واحدًا (12 - 2 = 10)', w.eval('contacts.length'), 10);
  check('الدمج يحفظ البريد من السجل الآخر', w.eval("current.data['Email 1']"), 'a@x.com');
  check('الدمج لا يكرر الرقم نفسه', w.eval("phonesOf(current).length"), 1);

  w.eval('undo();');
  check('التراجع يعيد السجلات', w.eval('contacts.length'), 12);

  await wait(300);
  const stored = await w.eval("idb('state', 'readonly', s => s.get('current'))");
  check('الحفظ في IndexedDB يحتوي كل السجلات', stored && stored.contacts.length, 12);

  await w.eval("autoBackup('اختبار')");
  const backups = await w.eval("idb('backups', 'readonly', s => s.getAll())");
  check('النسخة التلقائية محفوظة', backups.length >= 1, true);

  w.eval(`importText(${JSON.stringify('Name\nمحمد محمود\nمحمود محمد\nمحمود تركي\nمحمود شرعي')}, false)`);
  check('ترتيب الكلمات يظهر كفئة مستقلة', w.eval("statusOf(contacts.find(c => nameOf(c) === 'محمد محمود'))"), 'order');
  check('محمود تركي / شرعي: ليسا متشابهين', w.eval("statusOf(contacts.find(c => nameOf(c) === 'محمود تركي'))"), 'unique');
  w.eval('undo();');
  check('التراجع بعد اختبار الترتيب يعيد السجلات', w.eval('contacts.length'), 12);

  await wait(300);                             // انتظار اكتمال الحفظ قبل إعادة الفتح
  const w2 = boot();                           // محاكاة إعادة فتح الصفحة
  await wait(400);
  check('بعد إعادة الفتح: البيانات باقية', w2.eval('contacts.length'), 12);

  check('لا أخطاء في وحدة التحكم', errors, []);
  console.log(`\n${pass} نجح، ${fail} فشل`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAILED TO RUN:', e); process.exit(2); });
