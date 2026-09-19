(function () {
  "use strict";

  var Cidr = window.Cidr;
  var COLORS = [
    "var(--s0)",
    "var(--s1)",
    "var(--s2)",
    "var(--s3)",
    "var(--s4)",
    "var(--s5)",
    "var(--s6)",
    "var(--s7)",
    "var(--s8)",
    "var(--s9)",
  ];
  var STORAGE_KEY = "vnet-ip-track-plan-v1";
  var HUB_EXAMPLE = {
    vnetName: "hub-vnet",
    parent: "10.0.0.0/16",
    subnets: [
      { name: "GatewaySubnet", cidr: "10.0.0.0/27" },
      { name: "snet-shared", cidr: "10.0.0.32/27" },
      { name: "snet-app", cidr: "10.0.1.0/24" },
      { name: "snet-data", cidr: "10.0.2.0/24" },
      { name: "snet-pe", cidr: "10.0.3.0/26" },
    ],
  };

  var els = {
    vnetName: document.getElementById("vnet-name"),
    parentCidr: document.getElementById("parent-cidr"),
    parentMeta: document.getElementById("parent-meta"),
    parentError: document.getElementById("parent-error"),
    subnetName: document.getElementById("subnet-name"),
    carvePrefix: document.getElementById("carve-prefix"),
    exactCidr: document.getElementById("exact-cidr"),
    azureMode: document.getElementById("azure-mode"),
    splitCount: document.getElementById("split-count"),
    map: document.getElementById("map"),
    mapCaption: document.getElementById("map-caption"),
    lattice: document.getElementById("lattice"),
    windowLabel: document.getElementById("window-label"),
    planBody: document.getElementById("plan-body"),
    tableCaption: document.getElementById("table-caption"),
    leftovers: document.getElementById("leftovers"),
    utilFill: document.getElementById("util-fill"),
    utilLabel: document.getElementById("util-label"),
    planStatus: document.getElementById("plan-status"),
    utilMeter: document.querySelector(".meter"),
  };

  var state = {
    vnetName: "hub-vnet",
    parentInput: "10.0.0.0/16",
    parent: null,
    parentError: "",
    subnets: [],
    selectedId: null,
    window: null,
    preview: null,
    nextId: 1,
    azureMode: true,
    message: "",
  };

  function colorFor(id) {
    return COLORS[(id - 1) % COLORS.length];
  }

  function parseParent(text) {
    try {
      var block = Cidr.parseCidr(text);
      return { block: block, error: "" };
    } catch (err) {
      return { block: null, error: err.message };
    }
  }

  function applyParent(text, resetWindow) {
    state.parentInput = text;
    var parsed = parseParent(text);
    state.parent = parsed.block;
    state.parentError = parsed.error;
    if (state.parent && resetWindow) {
      state.window = defaultWindow(state.parent);
    }
    if (state.parent && state.window && !Cidr.contains(state.parent, state.window)) {
      state.window = defaultWindow(state.parent);
    }
  }

  function defaultWindow(parent) {
    if (parent.prefix >= 24) return Cidr.fromNetwork(parent.network, parent.prefix);
    return Cidr.fromNetwork(parent.network, 24);
  }

  function blocksOfPlan() {
    return state.subnets.map(function (s) {
      return s.block;
    });
  }

  function nextName() {
    var typed = els.subnetName.value.trim();
    if (typed) return typed;
    var n = state.subnets.length + 1;
    return "snet-" + String(n).padStart(2, "0");
  }

  function addBlock(name, block, opts) {
    opts = opts || {};
    if (!state.parent) {
      toast("Set a valid parent CIDR first");
      return false;
    }
    if (!block.aligned) {
      toast(block.cidr + " is not aligned — using " + Cidr.fromNetwork(block.network, block.prefix).cidr);
      block = Cidr.fromNetwork(block.network, block.prefix);
    }
    var row = {
      id: state.nextId++,
      name: name || nextName(),
      block: block,
    };
    state.subnets.push(row);
    state.selectedId = row.id;
    clearToast();
    if (!opts.keepName) els.subnetName.value = "";
    els.exactCidr.value = "";
    persist();
    render();
    return true;
  }

  function toast(message) {
    state.message = message;
    els.planStatus.textContent = message;
  }

  function clearToast() {
    state.message = "";
  }

  function removeSelected() {
    if (state.selectedId == null) return;
    clearToast();
    state.subnets = state.subnets.filter(function (s) {
      return s.id !== state.selectedId;
    });
    state.selectedId = null;
    persist();
    render();
  }

  function clearPlan() {
    clearToast();
    state.subnets = [];
    state.selectedId = null;
    persist();
    render();
  }

  function loadExample() {
    clearToast();
    els.vnetName.value = HUB_EXAMPLE.vnetName;
    els.parentCidr.value = HUB_EXAMPLE.parent;
    state.vnetName = HUB_EXAMPLE.vnetName;
    applyParent(HUB_EXAMPLE.parent, true);
    state.subnets = [];
    state.nextId = 1;
    HUB_EXAMPLE.subnets.forEach(function (s) {
      state.subnets.push({
        id: state.nextId++,
        name: s.name,
        block: Cidr.parseCidr(s.cidr),
      });
    });
    state.selectedId = state.subnets[0] ? state.subnets[0].id : null;
    persist();
    render();
  }

  function placeNextFree() {
    if (!state.parent) return;
    var prefix = Number(els.carvePrefix.value);
    var found = Cidr.findNextFree(state.parent, blocksOfPlan(), prefix);
    if (!found) {
      toast("No free aligned /" + prefix + " left in this address space");
      return;
    }
    addBlock(nextName(), found);
  }

  function addExact() {
    var text = els.exactCidr.value.trim();
    if (!text) {
      toast("Enter an exact CIDR or click the map");
      return;
    }
    try {
      addBlock(nextName(), Cidr.parseCidr(text));
    } catch (err) {
      toast(err.message);
    }
  }

  function splitVnet() {
    if (!state.parent) return;
    var count = Number(els.splitCount.value);
    if (state.subnets.length && !confirm("Replace the current plan with " + count + " equal subnets?")) {
      return;
    }
    clearToast();
    try {
      var parts = Cidr.equalSplit(state.parent, count);
      state.subnets = [];
      state.nextId = 1;
      parts.forEach(function (part, i) {
        state.subnets.push({
          id: state.nextId++,
          name: "snet-" + String(i + 1).padStart(2, "0"),
          block: part,
        });
      });
      state.selectedId = state.subnets[0].id;
      persist();
      render();
    } catch (err) {
      toast(err.message);
    }
  }

  function splitHole() {
    if (!state.parent) return;
    var holes = Cidr.freeBlocks(state.parent, blocksOfPlan());
    if (!holes.length) {
      toast("No unallocated space left");
      return;
    }
    holes.sort(function (a, b) {
      return b.size - a.size;
    });
    var count = Number(els.splitCount.value);
    clearToast();
    try {
      var parts = Cidr.equalSplit(holes[0], count);
      parts.forEach(function (part, i) {
        state.subnets.push({
          id: state.nextId++,
          name: nextName() || "snet-hole-" + (i + 1),
          block: part,
        });
      });
      persist();
      render();
    } catch (err) {
      toast("Largest hole " + holes[0].cidr + " cannot split into " + count + ": " + err.message);
    }
  }

  function coveringSubnet(ipInt) {
    for (var i = 0; i < state.subnets.length; i++) {
      var b = state.subnets[i].block;
      if (ipInt >= b.network && ipInt <= b.broadcast) return state.subnets[i];
    }
    return null;
  }

  function previewBlockAt(ipInt) {
    var prefix = Number(els.carvePrefix.value);
    return Cidr.alignedBlockContaining(ipInt, prefix);
  }

  function canPlace(block) {
    if (!state.parent || !Cidr.contains(state.parent, block)) return false;
    var used = blocksOfPlan();
    for (var i = 0; i < used.length; i++) {
      if (Cidr.overlaps(block, used[i])) return false;
    }
    return true;
  }

  function placeAt(ipInt) {
    var block = previewBlockAt(ipInt);
    var existing = coveringSubnet(ipInt);
    if (existing && existing.block.prefix <= block.prefix) {
      state.selectedId = existing.id;
      jumpWindowTo(existing.block);
      persist();
      render();
      return;
    }
    if (!canPlace(block)) {
      toast("Blocked: " + block.cidr + " overlaps an existing subnet or leaves the VNet");
      render();
      return;
    }
    addBlock(nextName(), block);
    jumpWindowTo(block);
  }

  function jumpWindowTo(block) {
    if (!state.parent) return;
    if (state.parent.prefix >= 24) {
      state.window = Cidr.fromNetwork(state.parent.network, state.parent.prefix);
      return;
    }
    var w = Cidr.fromNetwork(block.network, 24);
    if (!Cidr.contains(state.parent, w)) {
      w = Cidr.fromNetwork(state.parent.network, 24);
    }
    if (!Cidr.contains(state.parent, w)) {
      state.window = Cidr.fromNetwork(state.parent.network, state.parent.prefix);
      return;
    }
    state.window = w;
  }

  function stepWindow(dir) {
    if (!state.parent || !state.window) return;
    var size = state.window.size;
    var next = state.window.network + dir * size;
    if (next < state.parent.network || next + size - 1 > state.parent.broadcast) return;
    state.window = Cidr.fromNetwork(next, state.window.prefix);
    persist();
    render();
  }

  function fillCarveOptions() {
    var min = state.parent ? state.parent.prefix : 8;
    var max = 30;
    var current = els.carvePrefix.value;
    els.carvePrefix.innerHTML = "";
    for (var p = min; p <= max; p++) {
      var opt = document.createElement("option");
      opt.value = String(p);
      var hosts = Cidr.blockSize(p);
      opt.textContent = "/" + p + " · " + formatCount(hosts) + " addr";
      els.carvePrefix.appendChild(opt);
    }
    if (current && Number(current) >= min && Number(current) <= max) {
      els.carvePrefix.value = current;
    } else {
      els.carvePrefix.value = String(Math.min(24, max));
    }
  }

  function formatCount(n) {
    return n.toLocaleString("en-US");
  }

  function hostInfo(block) {
    if (state.azureMode) {
      var az = Cidr.azureUsable(block);
      return {
        count: az.count,
        first: az.first === null ? "—" : Cidr.intToIpv4(az.first),
        last: az.last === null ? "—" : Cidr.intToIpv4(az.last),
        kind: "Azure",
      };
    }
    var rfc = Cidr.rfcUsable(block);
    return {
      count: rfc.count,
      first: Cidr.intToIpv4(rfc.first),
      last: Cidr.intToIpv4(rfc.last),
      kind: "RFC",
    };
  }

  function tileLabel(parent, tile) {
    if (parent.prefix <= 16 && tile.prefix === 24) {
      return String((tile.network >>> 8) & 255);
    }
    if (parent.prefix <= 8 && tile.prefix === 16) {
      return String((tile.network >>> 16) & 255);
    }
    if (tile.prefix >= 24) {
      return String(tile.network & 255);
    }
    return Cidr.intToIpv4(tile.network).split(".").slice(2).join(".");
  }

  function latticeLabel(windowBlock, cell) {
    if (windowBlock.prefix >= 24) return String(cell.network & 255);
    if (windowBlock.prefix >= 16) {
      return ((cell.network >>> 8) & 255) + "." + (cell.network & 255);
    }
    return Cidr.intToIpv4(cell.network);
  }

  function renderParentMeta() {
    if (state.parentError) {
      els.parentError.hidden = false;
      els.parentError.textContent = state.parentError;
      els.parentMeta.textContent = "";
      return;
    }
    els.parentError.hidden = true;
    var p = state.parent;
    var kind = Cidr.classifyAddress(p.network);
    els.parentMeta.textContent =
      p.cidr +
      " · mask " +
      Cidr.maskToIpv4(p.prefix) +
      " · " +
      formatCount(p.size) +
      " addresses · " +
      kind.label;
  }

  function renderStats() {
    if (!state.parent) {
      els.utilFill.style.width = "0%";
      els.utilLabel.textContent = "Enter a parent CIDR to begin.";
      return;
    }
    var analysis = Cidr.analyzePlan(state.parent, blocksOfPlan());
    var pct = analysis.total ? Math.round((analysis.used / analysis.total) * 1000) / 10 : 0;
    els.utilFill.style.width = Math.min(100, pct) + "%";
    els.utilMeter.classList.toggle("is-bad", analysis.hasErrors);
    els.utilLabel.textContent =
      formatCount(analysis.used) +
      " / " +
      formatCount(analysis.total) +
      " addresses allocated (" +
      pct +
      "%) · " +
      formatCount(analysis.free) +
      " free";
    if (state.message) {
      els.planStatus.textContent = state.message;
    } else if (analysis.hasErrors) {
      els.planStatus.textContent =
        "Plan has overlapping or invalid allocations — they are marked red on the map.";
    } else if (state.subnets.length) {
      els.planStatus.textContent =
        state.subnets.length +
        " subnet" +
        (state.subnets.length === 1 ? "" : "s") +
        " in " +
        state.vnetName +
        " — no overlaps";
    } else {
      els.planStatus.textContent = "Empty plan. Click the map or place the next free subnet.";
    }
  }

  function hitsOverlapEachOther(hits) {
    for (var i = 0; i < hits.length; i++) {
      for (var j = i + 1; j < hits.length; j++) {
        if (Cidr.overlaps(hits[i].block, hits[j].block)) return true;
      }
    }
    return false;
  }

  function subnetAtRange(start, end) {
    var hits = [];
    for (var i = 0; i < state.subnets.length; i++) {
      var b = state.subnets[i].block;
      if (Cidr.overlaps(b, { network: start, broadcast: end })) hits.push(state.subnets[i]);
    }
    return hits;
  }

  function renderMap() {
    els.map.innerHTML = "";
    if (!state.parent) {
      els.mapCaption.textContent = "Parent CIDR is invalid.";
      return;
    }
    var layout = Cidr.mapLayout(state.parent);
    els.map.style.gridTemplateColumns = "repeat(" + layout.cols + ", minmax(0, 1fr))";
    els.mapCaption.textContent =
      layout.count +
      " tiles at /" +
      layout.tilePrefix +
      " (" +
      layout.rows +
      "×" +
      layout.cols +
      "). Click a free tile to carve a /" +
      els.carvePrefix.value +
      "; click an allocated tile to select it.";
    for (var i = 0; i < layout.count; i++) {
      var net = (state.parent.network + i * layout.tileSize) >>> 0;
      var tile = Cidr.fromNetwork(net, layout.tilePrefix);
      var hits = subnetAtRange(tile.network, tile.broadcast);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-cell";
      btn.textContent = tileLabel(state.parent, tile);
      btn.title = tile.cidr;
      btn.setAttribute("role", "gridcell");

      if (hits.length === 1) {
        btn.style.background = colorFor(hits[0].id);
        btn.classList.add("is-taken");
        if (hits[0].id === state.selectedId) btn.classList.add("is-selected");
      } else if (hits.length > 1 && hitsOverlapEachOther(hits)) {
        btn.classList.add("is-blocked");
        btn.dataset.baseBlocked = "1";
        btn.title = tile.cidr + " — overlapping subnets";
      } else if (hits.length > 1) {
        btn.style.background = colorFor(hits[0].id);
        btn.classList.add("is-contains");
        btn.title =
          tile.cidr +
          " · " +
          hits
            .map(function (h) {
              return h.name;
            })
            .join(", ");
      } else {
        btn.classList.add("is-free");
      }

      if (state.window && Cidr.overlaps(tile, state.window)) {
        btn.classList.add("is-window");
      }

      btn.dataset.network = String(tile.network);
      btn.dataset.broadcast = String(tile.broadcast);
      els.map.appendChild(btn);
    }
    paintPreview();
  }

  function eachPaintTarget(fn) {
    els.map.querySelectorAll(".map-cell").forEach(fn);
    els.lattice.querySelectorAll(".lat-cell").forEach(fn);
  }

  function paintPreview() {
    var preview = state.preview;
    eachPaintTarget(function (btn) {
      btn.classList.remove("is-preview");
      if (!btn.dataset.baseBlocked) btn.classList.remove("is-blocked");
      if (!preview) return;
      var start = Number(btn.dataset.network);
      var end = Number(btn.dataset.broadcast);
      if (preview.network <= end && start <= preview.broadcast) {
        if (canPlace(preview)) {
          btn.classList.add("is-preview");
        } else {
          btn.classList.add("is-blocked");
        }
      }
    });
  }

  function renderLattice() {
    els.lattice.innerHTML = "";
    if (!state.parent) return;
    if (!state.window) state.window = defaultWindow(state.parent);
    els.windowLabel.textContent = state.window.cidr;

    var maxPrefix = Math.min(30, state.window.prefix + 6);

    for (var prefix = state.window.prefix; prefix <= maxPrefix; prefix++) {
      var row = document.createElement("div");
      row.className = "lat-row";
      var label = document.createElement("div");
      label.className = "lat-label";
      label.innerHTML =
        "<strong>/" +
        prefix +
        "</strong><span>" +
        Cidr.maskToIpv4(prefix) +
        "</span>";
      var cells = document.createElement("div");
      cells.className = "lat-cells";
      var count = Math.pow(2, prefix - state.window.prefix);
      cells.style.gridTemplateColumns = "repeat(" + count + ", minmax(0, 1fr))";
      var size = Cidr.blockSize(prefix);

      for (var i = 0; i < count; i++) {
        var net = (state.window.network + i * size) >>> 0;
        var cell = Cidr.fromNetwork(net, prefix);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lat-cell";
        btn.textContent = latticeLabel(state.window, cell);
        btn.title = cell.cidr;

        var exact = state.subnets.find(function (s) {
          return s.block.network === cell.network && s.block.prefix === cell.prefix;
        });
        var hits = subnetAtRange(cell.network, cell.broadcast);
        var parentHit = hits.find(function (s) {
          return s.block.prefix < cell.prefix && Cidr.contains(s.block, cell);
        });
        var childHit = hits.find(function (s) {
          return s.block.prefix > cell.prefix && Cidr.contains(cell, s.block);
        });

        if (exact) {
          btn.style.background = colorFor(exact.id);
          if (exact.id === state.selectedId) btn.classList.add("is-selected");
        } else if (hits.length > 1 && hitsOverlapEachOther(hits)) {
          btn.classList.add("is-blocked");
          btn.dataset.baseBlocked = "1";
        } else if (parentHit) {
          btn.style.background = colorFor(parentHit.id);
          btn.classList.add("is-covered");
        } else if (childHit) {
          btn.style.background = colorFor(childHit.id);
          btn.classList.add("is-contains");
        } else {
          btn.classList.add("is-free");
        }

        btn.dataset.network = String(cell.network);
        btn.dataset.broadcast = String(cell.broadcast);
        btn.dataset.prefix = String(cell.prefix);
        btn.dataset.exact = exact ? "1" : "";
        cells.appendChild(btn);
      }
      row.appendChild(label);
      row.appendChild(cells);
      els.lattice.appendChild(row);
    }
    paintPreview();
  }

  function renderTable() {
    els.planBody.innerHTML = "";
    if (!state.parent) return;
    var analysis = Cidr.analyzePlan(state.parent, blocksOfPlan());
    state.subnets.forEach(function (s, i) {
      var info = hostInfo(s.block);
      var desc = Cidr.describeBlock(s.block, s.name);
      var issues = analysis.rows[i].issues;
      var tr = document.createElement("tr");
      if (s.id === state.selectedId) tr.classList.add("is-selected");
      tr.innerHTML =
        "<td><span class=\"dot\" style=\"background:" +
        colorFor(s.id) +
        "\"></span>" +
        escapeHtml(s.name) +
        "</td>" +
        "<td><code>" +
        desc.cidr +
        "</code></td>" +
        "<td><code>" +
        desc.mask +
        "</code></td>" +
        "<td><code>" +
        desc.network +
        "</code></td>" +
        "<td><code>" +
        info.first +
        " – " +
        info.last +
        "</code></td>" +
        "<td><code>" +
        desc.broadcast +
        "</code></td>" +
        "<td class=\"num\">" +
        formatCount(info.count) +
        "</td>" +
        "<td>" +
        (issues.length
          ? "<span class=\"badge err\">" + escapeHtml(issues[0].message) + "</span>"
          : "<span class=\"badge ok\">ok</span>") +
        "</td>";
      tr.addEventListener("click", function () {
        state.selectedId = s.id;
        jumpWindowTo(s.block);
        els.subnetName.value = s.name;
        els.carvePrefix.value = String(s.block.prefix);
        render();
      });
      els.planBody.appendChild(tr);
    });
    els.tableCaption.textContent = state.azureMode
      ? "Usable range uses Azure reservations (size − 5)."
      : "Usable range uses RFC host addresses (size − 2 for /30 and larger).";
  }

  function renderLeftovers() {
    els.leftovers.innerHTML = "";
    if (!state.parent) return;
    var holes = Cidr.freeBlocks(state.parent, blocksOfPlan());
    if (!holes.length) {
      var empty = document.createElement("li");
      empty.textContent = state.subnets.length ? "No free blocks left" : "Whole address space is free";
      els.leftovers.appendChild(empty);
      return;
    }
    holes.forEach(function (hole) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = hole.cidr + " · " + formatCount(hole.size);
      btn.title = "Inspect this leftover on the lattice";
      btn.addEventListener("click", function () {
        jumpWindowTo(hole);
        var options = els.carvePrefix.options;
        var desired = String(hole.prefix);
        var has = false;
        for (var i = 0; i < options.length; i++) {
          if (options[i].value === desired) has = true;
        }
        if (has) els.carvePrefix.value = desired;
        persist();
        render();
      });
      li.appendChild(btn);
      els.leftovers.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    fillCarveOptions();
    renderParentMeta();
    renderStats();
    renderMap();
    renderLattice();
    renderTable();
    renderLeftovers();
  }

  function serialise() {
    return {
      vnetName: state.vnetName,
      parent: state.parentInput,
      azureMode: state.azureMode,
      window: state.window ? state.window.cidr : "",
      subnets: state.subnets.map(function (s) {
        return { name: s.name, cidr: s.block.cidr };
      }),
    };
  }

  function persist() {
    var data = serialise();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      /* ignore quota / private mode */
    }
    var bits = ["n=" + encodeURIComponent(data.vnetName), "p=" + encodeURIComponent(data.parent)];
    data.subnets.forEach(function (s) {
      bits.push("s=" + encodeURIComponent(s.name + ":" + s.cidr));
    });
    history.replaceState(null, "", "#" + bits.join("&"));
  }

  function applySerialised(data) {
    if (!data) return;
    state.vnetName = data.vnetName || "hub-vnet";
    els.vnetName.value = state.vnetName;
    els.parentCidr.value = data.parent || "10.0.0.0/16";
    applyParent(els.parentCidr.value, true);
    state.azureMode = data.azureMode !== false;
    els.azureMode.checked = state.azureMode;
    state.subnets = [];
    state.nextId = 1;
    (data.subnets || []).forEach(function (s) {
      try {
        state.subnets.push({
          id: state.nextId++,
          name: s.name,
          block: Cidr.parseCidr(s.cidr),
        });
      } catch (err) {
        /* skip bad row */
      }
    });
    if (data.window) {
      try {
        state.window = Cidr.parseCidr(data.window);
      } catch (err) {
        state.window = state.parent ? defaultWindow(state.parent) : null;
      }
    }
  }

  function loadFromHash() {
    if (!location.hash || location.hash.length < 2) return null;
    var params = new URLSearchParams(location.hash.slice(1));
    var parent = params.get("p");
    if (!parent) return null;
    var subnets = [];
    params.getAll("s").forEach(function (item) {
      var idx = item.lastIndexOf(":");
      if (idx === -1) return;
      subnets.push({ name: item.slice(0, idx), cidr: item.slice(idx + 1) });
    });
    return {
      vnetName: params.get("n") || "hub-vnet",
      parent: parent,
      subnets: subnets,
      azureMode: true,
    };
  }

  function loadInitial() {
    var fromHash = loadFromHash();
    if (fromHash) {
      applySerialised(fromHash);
      return;
    }
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        applySerialised(JSON.parse(raw));
        return;
      }
    } catch (err) {
      /* ignore */
    }
    loadExample();
  }

  function tableRows() {
    if (!state.parent) return [];
    var analysis = Cidr.analyzePlan(state.parent, blocksOfPlan());
    return state.subnets.map(function (s, i) {
      var info = hostInfo(s.block);
      var desc = Cidr.describeBlock(s.block, s.name);
      var issues = analysis.rows[i].issues.map(function (x) {
        return x.message;
      });
      return {
        vnet: state.vnetName,
        name: s.name,
        cidr: desc.cidr,
        mask: desc.mask,
        network: desc.network,
        usable: info.first + " - " + info.last,
        broadcast: desc.broadcast,
        hosts: info.count,
        accounting: info.kind,
        status: issues.length ? issues.join("; ") : "ok",
      };
    });
  }

  function exportCsv() {
    var rows = tableRows();
    var headers = [
      "vnet",
      "name",
      "cidr",
      "mask",
      "network",
      "usable",
      "broadcast",
      "hosts",
      "accounting",
      "status",
    ];
    var lines = [headers.join(",")];
    rows.forEach(function (r) {
      lines.push(
        headers
          .map(function (h) {
            var v = String(r[h] == null ? "" : r[h]);
            if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
            return v;
          })
          .join(",")
      );
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.vnetName || "vnet") + "-subnets.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyTable() {
    var rows = tableRows();
    var headers = [
      "Name",
      "CIDR",
      "Mask",
      "Network",
      "Usable range",
      "Broadcast",
      "Hosts",
      "Status",
    ];
    var lines = [headers.join("\t")];
    rows.forEach(function (r) {
      lines.push(
        [r.name, r.cidr, r.mask, r.network, r.usable, r.broadcast, r.hosts, r.status].join("\t")
      );
    });
    var text = lines.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          toast("Table copied — paste into a spreadsheet");
        },
        function () {
          window.prompt("Copy this table", text);
        }
      );
    } else {
      window.prompt("Copy this table", text);
    }
  }

  function bind() {
    els.vnetName.addEventListener("input", function () {
      state.vnetName = els.vnetName.value.trim() || "vnet";
      persist();
      renderStats();
    });
    els.parentCidr.addEventListener("change", function () {
      applyParent(els.parentCidr.value, true);
      persist();
      render();
    });
    els.parentCidr.addEventListener("input", function () {
      applyParent(els.parentCidr.value, false);
      renderParentMeta();
    });
    els.azureMode.addEventListener("change", function () {
      state.azureMode = els.azureMode.checked;
      persist();
      render();
    });
    els.carvePrefix.addEventListener("change", function () {
      state.preview = null;
      paintPreview();
    });

    els.map.addEventListener("mouseover", function (ev) {
      var btn = ev.target.closest(".map-cell");
      if (!btn) return;
      state.preview = previewBlockAt(Number(btn.dataset.network));
      paintPreview();
    });
    els.map.addEventListener("mouseleave", function () {
      state.preview = null;
      paintPreview();
    });
    els.map.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".map-cell");
      if (!btn) return;
      placeAt(Number(btn.dataset.network));
    });

    els.lattice.addEventListener("mouseover", function (ev) {
      var btn = ev.target.closest(".lat-cell");
      if (!btn) return;
      state.preview = Cidr.fromNetwork(Number(btn.dataset.network), Number(btn.dataset.prefix));
      paintPreview();
    });
    els.lattice.addEventListener("mouseleave", function () {
      state.preview = null;
      paintPreview();
    });
    els.lattice.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".lat-cell");
      if (!btn) return;
      var network = Number(btn.dataset.network);
      var prefix = Number(btn.dataset.prefix);
      var existing = state.subnets.find(function (s) {
        return s.block.network === network && s.block.prefix === prefix;
      });
      if (existing) {
        if (state.selectedId === existing.id) {
          state.subnets = state.subnets.filter(function (s) {
            return s.id !== existing.id;
          });
          state.selectedId = null;
          persist();
          render();
          return;
        }
        state.selectedId = existing.id;
        persist();
        render();
        return;
      }
      els.carvePrefix.value = String(prefix);
      placeAt(network);
    });

    document.getElementById("btn-next-free").addEventListener("click", placeNextFree);
    document.getElementById("btn-add-exact").addEventListener("click", addExact);
    document.getElementById("btn-split-vnet").addEventListener("click", splitVnet);
    document.getElementById("btn-split-hole").addEventListener("click", splitHole);
    document.getElementById("btn-remove").addEventListener("click", removeSelected);
    document.getElementById("btn-clear").addEventListener("click", clearPlan);
    document.getElementById("btn-example").addEventListener("click", loadExample);
    document.getElementById("btn-export").addEventListener("click", exportCsv);
    document.getElementById("btn-copy").addEventListener("click", copyTable);
    document.getElementById("btn-win-prev").addEventListener("click", function () {
      stepWindow(-1);
    });
    document.getElementById("btn-win-next").addEventListener("click", function () {
      stepWindow(1);
    });

    document.querySelectorAll("[data-parent]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        els.parentCidr.value = btn.getAttribute("data-parent");
        applyParent(els.parentCidr.value, true);
        persist();
        render();
      });
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Delete" || ev.key === "Backspace") {
        var tag = (ev.target && ev.target.tagName) || "";
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        ev.preventDefault();
        removeSelected();
      }
    });

    els.exactCidr.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") addExact();
    });
  }

  bind();
  loadInitial();
  if (!state.parent) applyParent(els.parentCidr.value, true);
  render();
})();
