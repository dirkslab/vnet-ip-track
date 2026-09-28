var assert = require("assert");
var Cidr = require("../js/cidr.js");

function ok(cond, msg) {
  assert.ok(cond, msg);
}

function eq(a, b, msg) {
  assert.strictEqual(a, b, msg);
}

var failed = 0;
var passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (err) {
    failed += 1;
    console.log("  FAIL  " + name);
    console.log("        " + err.message);
  }
}

test("parse and align 10.0.1.5/16", function () {
  var b = Cidr.parseCidr("10.0.1.5/16");
  eq(b.cidr, "10.0.0.0/16");
  eq(b.aligned, false);
  eq(b.size, 65536);
  eq(b.broadcast, Cidr.ipv4ToInt("10.0.255.255"));
});

test("parse /24 and mask", function () {
  var b = Cidr.parseCidr("192.168.10.0/24");
  eq(b.aligned, true);
  eq(Cidr.maskToIpv4(24), "255.255.255.0");
  eq(Cidr.intToIpv4(b.broadcast), "192.168.10.255");
});

test("RFC usable counts", function () {
  eq(Cidr.rfcUsable(Cidr.parseCidr("10.0.0.0/24")).count, 254);
  eq(Cidr.rfcUsable(Cidr.parseCidr("10.0.0.0/30")).count, 2);
  eq(Cidr.rfcUsable(Cidr.parseCidr("10.0.0.0/31")).count, 2);
  eq(Cidr.rfcUsable(Cidr.parseCidr("10.0.0.1/32")).count, 1);
});

test("Azure usable subtracts five addresses", function () {
  var a = Cidr.azureUsable(Cidr.parseCidr("10.0.0.0/24"));
  eq(a.count, 251);
  eq(Cidr.intToIpv4(a.first), "10.0.0.4");
  eq(Cidr.intToIpv4(a.last), "10.0.0.254");
  eq(Cidr.azureUsable(Cidr.parseCidr("10.0.0.0/29")).count, 3);
  eq(Cidr.azureUsable(Cidr.parseCidr("10.0.0.0/30")).count, 0);
});

test("overlap and contain", function () {
  var p = Cidr.parseCidr("10.0.0.0/16");
  var a = Cidr.parseCidr("10.0.0.0/24");
  var b = Cidr.parseCidr("10.0.1.0/24");
  var c = Cidr.parseCidr("10.0.0.128/25");
  ok(Cidr.contains(p, a));
  ok(!Cidr.overlaps(a, b));
  ok(Cidr.overlaps(a, c));
  ok(!Cidr.contains(a, b));
});

test("next free skips occupied space", function () {
  var p = Cidr.parseCidr("10.0.0.0/16");
  var used = [Cidr.parseCidr("10.0.0.0/24"), Cidr.parseCidr("10.0.1.0/25")];
  var next24 = Cidr.findNextFree(p, used, 24);
  eq(next24.cidr, "10.0.2.0/24");
  var next25 = Cidr.findNextFree(p, used, 25);
  eq(next25.cidr, "10.0.1.128/25");
});

test("equal split /16 into 4", function () {
  var parts = Cidr.equalSplit(Cidr.parseCidr("10.0.0.0/16"), 4);
  eq(parts.length, 4);
  eq(parts[0].cidr, "10.0.0.0/18");
  eq(parts[3].cidr, "10.0.192.0/18");
});

test("free blocks after VLSM carve", function () {
  var p = Cidr.parseCidr("10.0.0.0/24");
  var used = [Cidr.parseCidr("10.0.0.0/26"), Cidr.parseCidr("10.0.0.128/25")];
  var free = Cidr.freeBlocks(p, used).map(function (b) {
    return b.cidr;
  });
  ok(free.indexOf("10.0.0.64/26") !== -1);
  eq(free.join(","), "10.0.0.64/26");
});

test("rangeToCidrs decomposes a hole", function () {
  var cidrs = Cidr.rangeToCidrs(
    Cidr.ipv4ToInt("10.0.0.8"),
    Cidr.ipv4ToInt("10.0.0.15")
  );
  eq(cidrs.length, 1);
  eq(cidrs[0].cidr, "10.0.0.8/29");
});

test("analyzePlan flags overlap and outside", function () {
  var p = Cidr.parseCidr("10.0.0.0/16");
  var plan = Cidr.analyzePlan(p, [
    Cidr.parseCidr("10.0.0.0/24"),
    Cidr.parseCidr("10.0.0.128/25"),
    Cidr.parseCidr("11.0.0.0/24"),
  ]);
  ok(plan.hasErrors);
  ok(!plan.rows[0].ok);
  ok(!plan.rows[1].ok);
  ok(!plan.rows[2].ok);
  eq(plan.used, 256);
});

test("classify private ranges", function () {
  eq(Cidr.classifyAddress(Cidr.ipv4ToInt("10.1.2.3")).private, true);
  eq(Cidr.classifyAddress(Cidr.ipv4ToInt("172.16.0.1")).label.indexOf("Class B") !== -1, true);
  eq(Cidr.classifyAddress(Cidr.ipv4ToInt("8.8.8.8")).private, false);
});

test("map layout for /16 is 16×16 /24 tiles", function () {
  var layout = Cidr.mapLayout(Cidr.parseCidr("10.0.0.0/16"));
  eq(layout.tilePrefix, 24);
  eq(layout.count, 256);
  eq(layout.cols, 16);
});

test("aligned block containing an address", function () {
  var b = Cidr.alignedBlockContaining(Cidr.ipv4ToInt("10.0.5.77"), 20);
  eq(b.cidr, "10.0.0.0/20");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
