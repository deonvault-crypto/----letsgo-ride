const fs = require('fs');
const path = require('path');

const headerPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@stripe',
  'stripe-react-native',
  'ios',
  'StripeSwiftInterop.h'
);

const oldDeclaration = 'typedef NS_ENUM(NSUInteger, STPPaymentStatus);';
const fixedDeclaration = 'typedef NS_ENUM(NSInteger, STPPaymentStatus);';

if (!fs.existsSync(headerPath)) {
  throw new Error(`Stripe interop header not found: ${headerPath}`);
}

const source = fs.readFileSync(headerPath, 'utf8');

if (source.includes(fixedDeclaration)) {
  console.log('Stripe Xcode 26 enum compatibility patch is already present.');
  process.exit(0);
}

const occurrences = source.split(oldDeclaration).length - 1;
if (occurrences !== 1) {
  throw new Error(
    `Expected exactly one STPPaymentStatus NSUInteger declaration, found ${occurrences}. Refusing an unsafe patch.`
  );
}

fs.writeFileSync(headerPath, source.replace(oldDeclaration, fixedDeclaration));
console.log('Applied Stripe Xcode 26 STPPaymentStatus compatibility patch.');
