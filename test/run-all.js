const modules = [
  require('./adapters.test.js'),
  require('./network.test.js'),
  require('./wifi.test.js'),
  require('./i18n.test.js'),
  require('./settings.test.js'),
  require('./autoMode.test.js')
];

let failures = 0;
let count = 0;

for (const mod of modules) {
  for (const [name, fn] of Object.entries(mod)) {
    count++;
    try {
      fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failures++;
      console.error(`FAIL - ${name}`);
      console.error(err);
    }
  }
}

console.log(`\n${count - failures}/${count} passed`);
process.exit(failures > 0 ? 1 : 0);
