// اختبارات توحيد الأسماء العربية والأرقام
// تشغيل: node arabic-name-tests.js contacts-manager-v4.html
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, 'contacts-manager-v4.html');
const html = fs.readFileSync(file, 'utf8');
const seg = html.slice(html.indexOf('/* ---------- تطبيع الأسماء والأرقام'), html.indexOf('/* ---------- قراءة الملفات'));
const {normalizeArabicName, compactKey, normPhone, levenshtein} =
  new Function('COUNTRY', seg + '\nreturn {normalizeArabicName, compactKey, normPhone, levenshtein};')('20');

let pass = 0, fail = 0;
const check = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`}`);
};
const sameLoose = (a, b) => compactKey(a) === compactKey(b);
// مشكوك فيه: متطابق في المفتاح العام لكنه مختلف في المفتاح الصارم
const ambiguous = (a, b) => sameLoose(a, b) && compactKey(a, true) !== compactKey(b, true);
const wordOrderSame = (a, b) =>
  normalizeArabicName(a).split(' ').sort().join('') === normalizeArabicName(b).split(' ').sort().join('');

console.log('--- تطابق مؤكد');
check('احمد = أحمد', sameLoose('احمد', 'أحمد'), true);
check('إيمان = ايمان', sameLoose('إيمان', 'ايمان'), true);
check('آمال = امال', sameLoose('آمال', 'امال'), true);
check('مؤمن = مومن', sameLoose('مؤمن', 'مومن'), true);
check('مُحمَّد = محمد (التشكيل)', sameLoose('مُحمَّد', 'محمد'), true);
check('مـحمـد = محمد (التطويل)', sameLoose('مـحمـد', 'محمد'), true);
check('عبد الله = عبدالله (المسافات)', sameLoose('عبد الله', 'عبدالله'), true);
check('علی (فارسية) = علي', sameLoose('علی', 'علي'), true);
check('احمد / أحمد ليس مشكوكًا فيه', ambiguous('احمد', 'أحمد'), false);
check('عبد الله / عبدالله ليس مشكوكًا فيه', ambiguous('عبد الله', 'عبدالله'), false);

console.log('--- متطابق في المفتاح العام لكنه يحتاج تحذيرًا قبل الدمج');
check('علي / على', ambiguous('علي', 'على'), true);
check('فاطمه / فاطمة', ambiguous('فاطمه', 'فاطمة'), true);
check('مصطفى / مصطفي', ambiguous('مصطفى', 'مصطفي'), true);

console.log('--- أسماء مختلفة');
check('محمد ≠ محمود', sameLoose('محمد', 'محمود'), false);
check('محمد / محمود فرق حرف واحد (يُقترح للمراجعة فقط)', levenshtein(compactKey('محمد'), compactKey('محمود')), 1);

console.log('--- ترتيب الكلمات');
check('أحمد محمد ~ محمد أحمد', wordOrderSame('أحمد محمد', 'محمد أحمد'), true);
check('أحمد محمد ليس محمد أحمد علي', wordOrderSame('أحمد محمد', 'محمد أحمد علي'), false);

console.log('--- الأرقام');
const P = '201012345678';
check('01012345678', normPhone('01012345678'), P);
check('+20 10 1234 5678', normPhone('+20 10 1234 5678'), P);
check('002010 1234 5678', normPhone('002010 1234 5678'), P);
check('(010) 1234-5678', normPhone('(010) 1234-5678'), P);
check('أرقام عربية ٠١٠١٢٣٤٥٦٧٨', normPhone('٠١٠١٢٣٤٥٦٧٨'), P);
check('رقم قصير يُرفض', normPhone('1234'), '');
check('الأرقام العربية في التطبيع', normalizeArabicName('٠١٢'), '012');

console.log('--- الأسماء الأصلية');
const original = 'أحمد  علي';
normalizeArabicName(original); compactKey(original); compactKey(original, true);
check('دوال التطبيع لا تغيّر النص الأصلي', original, 'أحمد  علي');

console.log('--- مطابقة الكلمات (v8)');
const fsrc = html.slice(html.indexOf('function fuzzyPairs('), html.indexOf('const FUZZY_SRC'));
const fuzzyPairs = new Function('levenshtein', fsrc + '\nreturn fuzzyPairs;')(levenshtein);
const item = n => ({k: compactKey(n), t: normalizeArabicName(n).split(' ').filter(Boolean)});
const pairsOf = (...names) => fuzzyPairs(names.map(item)).length;
check('محمد محمود / محمود محمد: ليس تشابهًا إملائيًا', pairsOf('محمد محمود', 'محمود محمد'), 0);
check('محمد محمود / محمود محمد: ترتيب كلمات مختلف', wordOrderSame('محمد محمود', 'محمود محمد'), true);
check('محمود تركي / محمود شرعي: ليس تشابهًا', pairsOf('محمود تركي', 'محمود شرعي'), 0);
check('محمد علي / محمود علي: تشابه إملائي (كلمة بحرف واحد)', pairsOf('محمد علي', 'محمود علي'), 1);
check('علي محمد / علا محمد: الكلمة القصيرة لا تُقارن تقريبيًا', pairsOf('علي محمد', 'علا محمد'), 0);
check('أحمد محمد / أحمد محمد: تطابق تام ليس تشابهًا تقريبيًا', pairsOf('أحمد محمد', 'أحمد محمد'), 0);
check('فاطمه محمد / فاطمة محمد: تطابق بعد التوحيد', sameLoose('فاطمه محمد', 'فاطمة محمد'), true);

console.log(`\n${pass} نجح، ${fail} فشل`);
process.exitCode = fail ? 1 : 0;
