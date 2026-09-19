/**
 * IPv4 CIDR helpers for the VNet planner.
 * Works in the browser (window.Cidr) and in Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Cidr = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PRIVATE_BLOCKS = [
    { cidr: "10.0.0.0/8", label: "RFC 1918 Class A" },
    { cidr: "172.16.0.0/12", label: "RFC 1918 Class B" },
    { cidr: "192.168.0.0/16", label: "RFC 1918 Class C" },
    { cidr: "100.64.0.0/10", label: "CGNAT / carrier-grade" },
    { cidr: "127.0.0.0/8", label: "loopback" },
  ];

  function ipv4ToInt(ip) {
    var parts = String(ip).trim().split(".");
    if (parts.length !== 4) {
      throw new Error("Invalid IPv4 address: " + ip);
    }
    var n = 0;
    for (var i = 0; i < 4; i++) {
      if (!/^\d+$/.test(parts[i])) {
        throw new Error("Invalid IPv4 address: " + ip);
      }
      var octet = Number(parts[i]);
      if (octet < 0 || octet > 255) {
        throw new Error("Invalid IPv4 address: " + ip);
      }
      n = ((n << 8) | octet) >>> 0;
    }
    return n;
  }

  function intToIpv4(n) {
    n = n >>> 0;
    return [
      (n >>> 24) & 255,
      (n >>> 16) & 255,
      (n >>> 8) & 255,
      n & 255,
    ].join(".");
  }

  function prefixToMask(prefix) {
    prefix = Number(prefix);
    if (prefix === 0) return 0;
    if (prefix === 32) return 0xffffffff;
    return (0xffffffff << (32 - prefix)) >>> 0;
  }

  function maskToIpv4(prefix) {
    return intToIpv4(prefixToMask(prefix));
  }

  function blockSize(prefix) {
    if (prefix === 0) return 4294967296;
    return Math.pow(2, 32 - prefix);
  }

  function isPowerOfTwo(n) {
    return n > 0 && (n & (n - 1)) === 0;
  }

  function parseCidr(input) {
    var text = String(input || "").trim();
    var match = text.match(/^(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})$/);
    if (!match) {
      throw new Error("Enter a CIDR such as 10.0.0.0/16");
    }
    var prefix = Number(match[2]);
    if (prefix < 0 || prefix > 32 || !Number.isInteger(prefix)) {
      throw new Error("Prefix must be an integer from 0 to 32");
    }
    var ip = ipv4ToInt(match[1]);
    var mask = prefixToMask(prefix);
    var network = (ip & mask) >>> 0;
    var size = blockSize(prefix);
    var broadcast = prefix === 0 ? 0xffffffff : (network + size - 1) >>> 0;
    return {
      input: text,
      ip: ip,
      network: network,
      prefix: prefix,
      mask: mask,
      size: size,
      broadcast: broadcast,
      aligned: network === ip,
      cidr: intToIpv4(network) + "/" + prefix,
    };
  }

  function fromNetwork(network, prefix) {
    network = network >>> 0;
    var mask = prefixToMask(prefix);
    network = (network & mask) >>> 0;
    var size = blockSize(prefix);
    var broadcast = prefix === 0 ? 0xffffffff : (network + size - 1) >>> 0;
    return {
      network: network,
      prefix: prefix,
      mask: mask,
      size: size,
      broadcast: broadcast,
      aligned: true,
      cidr: intToIpv4(network) + "/" + prefix,
    };
  }

  function alignedBlockContaining(ipInt, prefix) {
    return fromNetwork(ipInt, prefix);
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
  }

  function overlaps(a, b) {
    return rangesOverlap(a.network, a.broadcast, b.network, b.broadcast);
  }

  function contains(parent, child) {
    return child.network >= parent.network && child.broadcast <= parent.broadcast;
  }

  function rfcUsable(block) {
    if (block.prefix === 32) {
      return {
        count: 1,
        first: block.network,
        last: block.network,
        note: "Single host route",
      };
    }
    if (block.prefix === 31) {
      return {
        count: 2,
        first: block.network,
        last: block.broadcast,
        note: "Point-to-point (RFC 3021)",
      };
    }
    return {
      count: block.size - 2,
      first: (block.network + 1) >>> 0,
      last: (block.broadcast - 1) >>> 0,
      note: "Network and broadcast reserved",
    };
  }

  function azureUsable(block) {
    if (block.prefix > 29) {
      return {
        count: 0,
        first: null,
        last: null,
        note: "Azure subnets must be /29 or larger (5 addresses reserved)",
      };
    }
    return {
      count: block.size - 5,
      first: (block.network + 4) >>> 0,
      last: (block.broadcast - 1) >>> 0,
      note: "Azure reserves the first four addresses and the last address",
    };
  }

  function describeBlock(block, name) {
    var rfc = rfcUsable(block);
    var azure = azureUsable(block);
    return {
      name: name || "",
      cidr: block.cidr,
      prefix: block.prefix,
      mask: maskToIpv4(block.prefix),
      network: intToIpv4(block.network),
      broadcast: intToIpv4(block.broadcast),
      size: block.size,
      rfcFirst: intToIpv4(rfc.first),
      rfcLast: intToIpv4(rfc.last),
      rfcCount: rfc.count,
      azureFirst: azure.first === null ? "—" : intToIpv4(azure.first),
      azureLast: azure.last === null ? "—" : intToIpv4(azure.last),
      azureCount: azure.count,
      azureNote: azure.note,
    };
  }

  function classifyAddress(ipInt) {
    for (var i = 0; i < PRIVATE_BLOCKS.length; i++) {
      var block = parseCidr(PRIVATE_BLOCKS[i].cidr);
      if (ipInt >= block.network && ipInt <= block.broadcast) {
        return { private: true, label: PRIVATE_BLOCKS[i].label };
      }
    }
    return { private: false, label: "public / other" };
  }

  function rangeToCidrs(start, end) {
    start = start >>> 0;
    end = end >>> 0;
    if (start > end) return [];
    if (start === 0 && end === 0xffffffff) {
      return [fromNetwork(0, 0)];
    }
    var out = [];
    var cur = start;
    while (cur <= end) {
      var remaining = end - cur + 1;
      var align = cur === 0 ? 4294967296 : cur & -cur;
      var size = 1;
      while (size * 2 <= remaining && size * 2 <= align) {
        size *= 2;
      }
      var prefix = 32 - Math.round(Math.log(size) / Math.LN2);
      out.push(fromNetwork(cur, prefix));
      var next = cur + size;
      if (next > 0xffffffff || next <= cur) break;
      cur = next;
    }
    return out;
  }

  function mergeRanges(ranges) {
    if (!ranges.length) return [];
    var sorted = ranges
      .map(function (r) {
        return { start: r.start >>> 0, end: r.end >>> 0 };
      })
      .sort(function (a, b) {
        return a.start - b.start;
      });
    var merged = [{ start: sorted[0].start, end: sorted[0].end }];
    for (var i = 1; i < sorted.length; i++) {
      var last = merged[merged.length - 1];
      if (sorted[i].start <= last.end + 1) {
        last.end = Math.max(last.end, sorted[i].end);
      } else {
        merged.push({ start: sorted[i].start, end: sorted[i].end });
      }
    }
    return merged;
  }

  function freeBlocks(parent, allocations) {
    var used = [];
    for (var i = 0; i < allocations.length; i++) {
      var a = allocations[i];
      if (!overlaps(parent, a)) continue;
      used.push({
        start: Math.max(parent.network, a.network),
        end: Math.min(parent.broadcast, a.broadcast),
      });
    }
    var merged = mergeRanges(used);
    var holes = [];
    var cursor = parent.network;
    for (var j = 0; j < merged.length; j++) {
      if (cursor < merged[j].start) {
        holes = holes.concat(rangeToCidrs(cursor, merged[j].start - 1));
      }
      var after = merged[j].end + 1;
      cursor = after > 0xffffffff ? 0x100000000 : after;
    }
    if (cursor <= parent.broadcast) {
      holes = holes.concat(rangeToCidrs(cursor, parent.broadcast));
    }
    return holes;
  }

  function alignUp(addr, size) {
    var rem = addr % size;
    if (rem === 0) return addr;
    return addr + (size - rem);
  }

  function findNextFree(parent, allocations, prefix) {
    if (prefix < parent.prefix || prefix > 32) return null;
    var size = blockSize(prefix);
    var start = parent.network;
    var lastStart = parent.broadcast - size + 1;
    for (var addr = start; addr <= lastStart; ) {
      var candidate = fromNetwork(addr, prefix);
      if (!contains(parent, candidate)) {
        addr += size;
        continue;
      }
      var hit = false;
      for (var i = 0; i < allocations.length; i++) {
        if (overlaps(candidate, allocations[i])) {
          addr = alignUp((allocations[i].broadcast + 1) >>> 0, size);
          hit = true;
          break;
        }
      }
      if (!hit) return candidate;
    }
    return null;
  }

  function equalSplit(parent, count) {
    count = Number(count);
    if (!Number.isInteger(count) || count < 2) {
      throw new Error("Split count must be an integer ≥ 2");
    }
    if (parent.size % count !== 0) {
      throw new Error("Address space does not divide evenly into " + count);
    }
    var piece = parent.size / count;
    if (piece < 1 || (piece !== 4294967296 && !isPowerOfTwo(piece))) {
      throw new Error("Equal split needs a power-of-two piece size");
    }
    var prefix = piece === 4294967296 ? 0 : 32 - Math.round(Math.log(piece) / Math.LN2);
    var out = [];
    for (var i = 0; i < count; i++) {
      out.push(fromNetwork(parent.network + i * piece, prefix));
    }
    return out;
  }

  function mapLayout(parent) {
    var bits = Math.min(8, 32 - parent.prefix);
    var count = Math.pow(2, bits);
    var tilePrefix = parent.prefix + bits;
    var cols;
    var rows;
    var side = Math.sqrt(count);
    if (Number.isInteger(side) && side <= 16) {
      cols = side;
      rows = side;
    } else {
      cols = Math.min(16, count);
      while (count % cols !== 0) cols--;
      rows = count / cols;
    }
    return {
      tilePrefix: tilePrefix,
      tileSize: blockSize(tilePrefix),
      count: count,
      cols: cols,
      rows: rows,
    };
  }

  function issuesFor(parent, subnet) {
    var issues = [];
    if (!subnet.aligned) {
      issues.push({
        level: "error",
        code: "unaligned",
        message: subnet.cidr + " is not aligned to /" + subnet.prefix,
      });
    }
    if (!contains(parent, subnet)) {
      issues.push({
        level: "error",
        code: "outside",
        message: subnet.cidr + " is outside the VNet address space",
      });
    }
    if (subnet.prefix < parent.prefix) {
      issues.push({
        level: "error",
        code: "larger",
        message: "Subnet is larger than the parent address space",
      });
    }
    return issues;
  }

  function analyzePlan(parent, subnets) {
    var rows = [];
    var used = 0;
    var overlapPairs = [];

    for (var i = 0; i < subnets.length; i++) {
      var issues = issuesFor(parent, subnets[i]);
      for (var j = 0; j < subnets.length; j++) {
        if (i === j) continue;
        if (overlaps(subnets[i], subnets[j])) {
          issues.push({
            level: "error",
            code: "overlap",
            message: subnets[i].cidr + " overlaps " + subnets[j].cidr,
          });
          if (i < j) overlapPairs.push([i, j]);
        }
      }
      var inside = contains(parent, subnets[i]);
      if (inside) used += subnets[i].size;
      rows.push({
        index: i,
        issues: issues,
        ok: issues.length === 0,
      });
    }

    // Over-count used if overlaps exist; clamp for the meter.
    var uniqueUsed = 0;
    var covered = [];
    for (var k = 0; k < subnets.length; k++) {
      if (!contains(parent, subnets[k])) continue;
      covered.push({ start: subnets[k].network, end: subnets[k].broadcast });
    }
    var merged = mergeRanges(covered);
    for (var m = 0; m < merged.length; m++) {
      uniqueUsed += merged[m].end - merged[m].start + 1;
    }

    return {
      rows: rows,
      overlapPairs: overlapPairs,
      used: uniqueUsed,
      rawUsed: used,
      total: parent.size,
      free: Math.max(0, parent.size - uniqueUsed),
      hasErrors: rows.some(function (r) {
        return !r.ok;
      }),
    };
  }

  return {
    ipv4ToInt: ipv4ToInt,
    intToIpv4: intToIpv4,
    prefixToMask: prefixToMask,
    maskToIpv4: maskToIpv4,
    blockSize: blockSize,
    parseCidr: parseCidr,
    fromNetwork: fromNetwork,
    alignedBlockContaining: alignedBlockContaining,
    overlaps: overlaps,
    contains: contains,
    rfcUsable: rfcUsable,
    azureUsable: azureUsable,
    describeBlock: describeBlock,
    classifyAddress: classifyAddress,
    rangeToCidrs: rangeToCidrs,
    freeBlocks: freeBlocks,
    findNextFree: findNextFree,
    equalSplit: equalSplit,
    mapLayout: mapLayout,
    analyzePlan: analyzePlan,
    PRIVATE_BLOCKS: PRIVATE_BLOCKS,
  };
});
