const assert = require('assert');
const { parsePersianAmount, parseRelativeMinutes, parseIntent } = require('../api/_core');

const amount = parsePersianAmount('از صادقی ۸۵۰ تومن گرفتم');
assert.strictEqual(amount.amount, 850000, 'colloquial ۸۵۰ تومن should become 850000');
assert.strictEqual(amount.ambiguousToman, true);

const written = parsePersianAmount('هشتصد و پنجاه هزار تومان');
assert.strictEqual(written.amount, 850000, 'written Persian amount should parse');

assert.strictEqual(parseRelativeMinutes('دو ساعت دیگه یادم بنداز'), 120);
assert.strictEqual(parseRelativeMinutes('2 ساعت دیگه یادم بنداز'), 120);
assert.strictEqual(parseRelativeMinutes('نیم ساعت دیگه'), 30);
assert.strictEqual(parseRelativeMinutes('فردا یادم بنداز'), 1440);
assert.strictEqual(parseRelativeMinutes('پس فردا یادم بنداز'), 2880);

const payment = parseIntent('از صادقی ۸۵۰ تومن گرفتم');
assert.strictEqual(payment.tool, 'aquagold.customer_payment');
assert.strictEqual(payment.args.amount, 850000);
assert.ok(payment.args.customerName.includes('صادقی'));

const reminder = parseIntent('دو ساعت دیگه یادم بنداز با مشتری تماس بگیرم');
assert.strictEqual(reminder.tool, 'reminder.create');
assert.strictEqual(reminder.args.minutes, 120);

console.log('Farangis core parser tests passed');
