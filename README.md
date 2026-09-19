# VNet IP Track

Offline **Azure VNet / subnet planner**. Type a parent CIDR, carve subnets on a visual map, and see mask, usable hosts, broadcast, leftovers, and overlaps.

This is an exploratory demo of [Dirk Slabbert](https://github.com/dirkslab)’s old Class-C subnetting notepad — a working product sketch, not a spec.

## Open / run

No build step and no backend.

1. Clone or download this repo.
2. Open `index.html` in a browser (double-click, or File → Open).

That is enough. If a browser blocks clipboard download from `file://`, run a tiny static server from the repo root:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

CIDR math can be checked with:

```bash
node tests/cidr.test.js
```

## What it does

- Plan a VNet address space (`10.0.0.0/16`, `172.16.0.0/12`, …).
- Add / remove subnets by next-free placement, exact CIDR, map click, or prefix-lattice click.
- Show mask, network, usable range, broadcast, and host count (RFC or Azure).
- Flag overlaps and allocations that fall outside the parent — red hatch, same “no vertical overlaps” rule as the original notes.
- Equal-split the whole VNet or the largest leftover hole (2 / 4 / 8 / 16).
- Export CSV or copy a pasteable table.
- Keep the plan in `localStorage` and in the URL hash so a refresh or a shared link round-trips.

Azure flavour is copy and accounting only: each subnet reserves the first four addresses and the last one. There are no Azure APIs in v1.

## How the two visuals teach CIDR

**Address-space map** — the whole VNet, tiled at a sensible prefix (a `/16` becomes a 16×16 grid of `/24`s, i.e. Class-C sized cells). Hover previews the aligned block for the selected prefix; click places it if it is free.

**Prefix lattice** — the original notepad, made real. Rows are prefix lengths; cells are network numbers (fourth octet inside a `/24` window). A selection paints its column: parents above and children below cannot be chosen without overlap. Click a painted cell again to unclick it.

Use ← / → to page through `/24` windows of a larger VNet.

## Original notes

`Subnet maker.htm` is kept as the source sketch (plain-text notes, not an app).

## Ideas / next

- Import an existing VNet (Azure JSON / Bicep / Terraform) and diff against this map.
- Multi-VNet peering: warn when two address spaces overlap.
- Named patterns: `GatewaySubnet`, Private Endpoint, delegated subnets.
- IPv6 dual-stack alongside the IPv4 lattice.
- Export Bicep or `az network vnet` commands from the table.
