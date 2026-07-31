# Feature Specification: WrtNova Frontend Rewrite

**Feature Branch**: `rewrite/frontend-speckit`

**Created**: 2026-07-31

**Status**: Draft

**Input**: Rewrite the WrtNova frontend from scratch as two pages (`/builder`,
`/networks`), dropping `/builder/advanced`. Preserve the product's capabilities
and every configuration field; redesign the interface, information architecture,
and visual language from first principles for a first-time user who does not know
OpenWrt.

## Context

WrtNova turns the OpenWrt firmware selector into a guided experience: pick a
router, answer questions in plain language, and download an image that boots
already configured — ad-blocking, a WireGuard tunnel, guest and IoT isolation,
multi-WAN failover, dynamic DNS, and port forwarding included. No SSH, no LuCI,
no build server.

The existing implementation is the ground truth for **what** the app does. It is
explicitly **not** ground truth for how it looks, how it is laid out, or how the
flow is organized. This specification therefore describes capabilities and user
outcomes, and deliberately does not describe screens, cards, panes, or markup.

## Scope

**In scope**: two pages.

- `/builder` — single-node guided builder for one router.
- `/networks` — fleet builder for a router plus its access points.

**Dropped**: `/builder/advanced`. The raw-script editor and its editor dependency
are removed along with the page, every route to it, and every link to it.

## Clarifications

### Session 2026-07-31

Ambiguities found by the structured coverage scan. Each was resolved in place
rather than referred back, because none of them changes what gets built in a way
the requester would plausibly decide differently. They are recorded here because
they are decisions, not deductions.

- **Q: Is the marketing landing page (`/`) in scope?** — A: It stays, and is
  restyled to the new visual language, because a rewritten product behind an
  un-rewritten front door reads as broken. Its content and information
  architecture are otherwise unchanged, except that every link and reference to
  the dropped advanced page is removed. Restyling the landing page is not a
  third page of product work.

- **Q: Do returning users keep their saved data?** — A: Yes. The persisted
  browser keys and payload shapes for build history, saved networks, and the
  release/device caches MUST be preserved across the rewrite, and existing stored
  values MUST load. A rewrite that silently discards a user's saved fleet is a
  data-loss bug, not a redesign. Migrations already present in the current data
  (renamed VPN fields, relocated hostname, mistakenly-scoped WAN MAC) MUST be
  carried over.

- **Q: Where is the tunnel refresh token persisted?** — A: Under the key
  `wrtnova_warp_refresh`, as the hard requirements state. Note for the record:
  the current implementation does not actually use that key — it stores the token
  inside each history entry and each saved network. The stated requirement wins;
  the per-entry copies are additionally retained so restoring an old build still
  reuses its identity.

- **Q: Do the two pages share one configuration editor?** — A: Yes, one editor
  definition serves both, with `/networks` presenting it as the shared
  configuration for a fleet. The two pages having independently drifting copies
  of the same seventy fields is the specific failure mode this rewrite exists to
  end. This is a requirement about behavior parity (FR-006), not a mandated code
  structure.

- **Q: Does the assembled script have to remain reachable at a fixed URL?** — A:
  Yes. The provisioning script MUST be served from the site root at
  `/wrtnova.sh`, and the runtime-fetched data files (timezone table, country
  list, threat-feed list) MUST remain reachable at stable paths, because the
  browser fetches them at runtime. Whatever the build produces must place them
  there.

- **Q: Which page owns build history?** — A: `/builder` only. `/networks` records
  the last build per node instead. Merging them is a product change, not a
  rewrite, and is out of scope.

- **Q: Is the live configuration preview required to be a persistent pane?** —
  A: No. User Story 2 requires that the user can inspect what will be applied and
  that it reflects the current form state without a manual refresh. Whether that
  is a docked pane, a drawer, a modal, or a step in the flow is a design decision
  deferred to the plan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First router, no OpenWrt knowledge (Priority: P1)

A person who bought a router and wants ad-blocking and a guest network arrives at
`/builder`. They identify their exact hardware by typing its consumer name, work
through a set of plain-language questions, and leave with a firmware file and
instructions on what to do with it. They never learn the words "target",
"profile", "UCI", or "VLAN" unless they choose to go looking.

**Why this priority**: This is the product. Everything else is an extension of it.

**Independent Test**: Fully testable on its own — pick a device, accept every
default, build, receive a download link. Delivers a working configured image.

**Acceptance Scenarios**:

1. **Given** a fresh visit to `/builder`, **When** the user types a consumer
   device name ("Archer C7"), **Then** matching hardware is offered and selecting
   one resolves its OpenWrt target, profile, and stock package set.
2. **Given** a device is selected and nothing else has been touched, **When** the
   user starts a build, **Then** a firmware image is produced using defaults that
   are safe for that hardware, with no required fields left unanswered.
3. **Given** no device is selected, **When** the user looks for the build action,
   **Then** it is unavailable and the reason is stated in plain language.
4. **Given** a build is running, **When** the user waits, **Then** progress and
   queue position are visible, and the outcome is either download links (with
   checksums) or an error explained in terms the user can act on.
5. **Given** the chosen feature set does not fit the device's flash, **When** the
   build is rejected for size, **Then** the app automatically retries with the
   next-lighter DNS engine and tells the user what it changed and why.

---

### User Story 2 - Reviewing exactly what will be applied (Priority: P1)

Before flashing a device they may not be able to recover easily, the user wants
to see precisely what the image will do — and to copy it, keep it, or hand it to
someone else. Secrets they typed must not be casually shoulder-surfable while
they do this.

**Why this priority**: Trust. The product's core promise is "your secrets never
leave your browser"; a user who cannot inspect the output cannot verify anything,
and flashing blind is the scariest part of the task.

**Independent Test**: Configure anything, inspect the resulting configuration,
copy it, confirm the copied text is complete and usable.

**Acceptance Scenarios**:

1. **Given** any configuration, **When** the user inspects what will be applied,
   **Then** they see the resulting settings, reflecting the current state of the
   form without needing to press anything to refresh it.
2. **Given** the configuration contains passwords, keys, or tokens, **When** it is
   displayed, **Then** those values are masked by default and revealing them is a
   deliberate act.
3. **Given** the user copies the configuration, **When** they paste it, **Then**
   the secrets are present and usable — masking is a display concern only.
4. **Given** the user wants the whole provisioning script rather than just their
   overrides, **When** they ask for it, **Then** the complete assembled script is
   shown, still honoring the masking choice.

---

### User Story 3 - Rebuilding and reusing past work (Priority: P2)

A user who built an image last month wants the same configuration again — for a
newer OpenWrt release, or after changing one setting.

**Why this priority**: Firmware building is repeated, not one-shot. Retyping
sixty fields is the difference between a tool people return to and one they use
once. It is P2 because the first build works without it.

**Independent Test**: Build, reload the page, restore the previous build,
confirm the form and device selection are as they were.

**Acceptance Scenarios**:

1. **Given** past builds exist, **When** the user opens their history, **Then**
   each entry identifies its device, release, and when it was made, and offers a
   download link when the image is still available.
2. **Given** the user restores an entry, **When** restoration completes, **Then**
   the device, release, and every configuration field are repopulated, and a
   release that no longer exists falls back to the nearest available one.
3. **Given** history is stored, **When** it is written, **Then** no password,
   key, or token is persisted in it.

---

### User Story 4 - Building a whole home network (Priority: P2)

A user with a main router and two or three access points wants one consistent
configuration across all of them, with only per-device differences (hardware,
management address, role, hostname) set individually — then one action that
builds every image.

**Why this priority**: This is the differentiating capability, but it depends on
the single-node builder being correct first.

**Independent Test**: Create a network, define shared settings, add a router and
two APs with different hardware, build all, receive one image per node.

**Acceptance Scenarios**:

1. **Given** a new network, **When** the user defines shared settings once,
   **Then** every node inherits them.
2. **Given** a node, **When** the user overrides a setting on it, **Then** the
   override applies to that node only and the shared value is unchanged.
3. **Given** a node is an access point, **When** its image is produced, **Then**
   settings that make no sense on an access point (its own upstream WAN identity,
   tunnel termination, port forwarding, dynamic DNS) are absent from its config.
4. **Given** a fleet of nodes, **When** the user builds them all, **Then** each
   node builds and reports its own progress, result, and errors independently,
   and one node failing does not prevent the others from completing.
5. **Given** networks the user created, **When** they return later, **Then**
   their networks and nodes are still there.

---

### User Story 5 - Getting a VPN tunnel without reading WireGuard docs (Priority: P3)

A user wants their traffic to leave over an encrypted tunnel but has no VPN
provider and does not know what a private key is. They ask WrtNova to set one up.

**Why this priority**: High delight, but strictly optional and dependent on an
external service being configured by the operator.

**Independent Test**: Trigger the prefill, confirm the tunnel fields populate and
the tunnel is switched on.

**Acceptance Scenarios**:

1. **Given** the prefill service is available, **When** the user requests it,
   **Then** a tunnel identity is obtained and the tunnel fields are filled in.
2. **Given** the fields were filled by prefill, **When** it completes, **Then**
   the tunnel is enabled, because filled-in tunnel settings with the tunnel off
   would be silently discarded at build time.
3. **Given** the user requests prefill repeatedly, **When** the service refuses
   for rate-limiting reasons, **Then** the user is told to wait rather than shown
   a raw error.
4. **Given** the user already obtained a tunnel identity this session, **When**
   they request prefill again, **Then** the existing identity is reused rather
   than a new one created.
5. **Given** the operator has not configured the prefill service, **When** the
   user visits, **Then** the rest of the application works normally.

---

### User Story 6 - Being stopped before a mistake reaches the hardware (Priority: P2)

A user assigns two networks the same VLAN, or names an interface something
OpenWrt already owns, or picks a Wi-Fi password too short to be valid. They find
out in the browser, not after flashing.

**Why this priority**: The cost of a bad config is a router that needs physical
recovery. It is P2 only because defaults are safe and most users never trip it.

**Independent Test**: Deliberately create each conflict class and confirm the
build is refused with an explanation attached to the offending field.

**Acceptance Scenarios**:

1. **Given** two enabled networks are explicitly assigned the same VLAN id,
   **When** the user tries to build, **Then** the build is refused and the
   conflict is identified.
2. **Given** a network's VLAN id is left at its default and that id is taken,
   **When** the configuration is resolved, **Then** it is automatically moved to
   the next free id — this is not an error — and the assigned value is visible to
   the user before they build.
3. **Given** an interface name matching one the system already owns, **When** the
   user tries to build, **Then** the build is refused and the name is identified
   as reserved.
4. **Given** the selected hardware has a limited VLAN table, **When** the user
   requests more trunked VLANs than fit, **Then** the excess is dropped, the
   configuration reflects the truncation, and the user is told which were dropped.
5. **Given** any malformed value (hostname, MAC, port list, IPv6 host id, network
   prefix, country code, dynamic-DNS name), **When** the user tries to build,
   **Then** the build is refused and the first offending visible field explains
   what is wrong with it.

---

### User Story 7 - Using the app in the user's own language (Priority: P3)

A non-English speaker uses the app entirely in their language.

**Why this priority**: Existing users depend on it; it does not gate a first build.

**Independent Test**: Switch locale, confirm all interface text changes.

**Acceptance Scenarios**:

1. **Given** a browser configured for one of the supported languages, **When**
   the app loads, **Then** it presents in that language.
2. **Given** a user chooses a language explicitly, **When** they return later,
   **Then** their choice is remembered.
3. **Given** a string has no translation, **When** it renders, **Then** English
   is shown rather than a raw key.

---

### Edge Cases

- The OpenWrt release advertised as stable has no published device index yet
  (mid-rollout): fall back to the previous stable release once and say so.
- A device title is shared by two different boards: both remain selectable and
  distinguishable.
- The assembled script exceeds the build server's size limit: it is compressed so
  the build still succeeds; if it still does not fit, the user is told which
  fields are the likely cause.
- A setting is only supported on newer OpenWrt releases: it is not offered on
  older ones, and a stale value carried over from a newer release is cleared.
- The device cannot support a capability (no compatible wireless driver, no
  compatible firmware variant): the setting is not offered and any stored value
  is cleared.
- The user enables one feature that makes another meaningless (a shared-password
  VLAN scheme versus per-client isolation; roaming assistance versus dense-area
  tuning; batman-adv versus two simultaneous mesh bands): the dependent control
  becomes inert and its value is forced to what will actually be built, rather
  than lying about it.
- The build server returns a build failure with compiler output: the output is
  surfaced rather than swallowed.
- Local storage is unavailable or full: caching, history, and saved networks
  degrade without breaking the build path.
- The user enters an IPv6 tunnel endpoint: host and port are separated correctly
  and round-trip without losing the port.

## Requirements *(mandatory)*

### Functional Requirements

#### Device and release resolution

- **FR-001**: The system MUST fetch the OpenWrt release list and the per-release
  device index directly from the OpenWrt downloads server, and MUST cache both
  locally with a bounded lifetime, refreshing in the background.
- **FR-002**: Users MUST be able to find their hardware by typing its consumer
  name, matched word-wise so partial multi-word queries succeed.
- **FR-003**: Selecting a device MUST resolve its target, profile, stock package
  set, and device-specific package set, and MUST expose the resulting hardware
  requirements to the user.
- **FR-004**: Users MUST be able to choose which OpenWrt release to build,
  including snapshot builds where they exist.
- **FR-005**: When the default release has no published device index, the system
  MUST fall back once to the next older stable release and tell the user.

#### Configuration

- **FR-006**: Every configuration key listed in Appendix A MUST have a home in
  the interface, reachable without leaving the page it belongs to.
- **FR-007**: A control that is off MUST contribute an empty value to the emitted
  configuration, never the literal `0`.
- **FR-008**: A value identical to the provisioning script's own default MUST NOT
  be emitted.
- **FR-009**: Settings that depend on a parent being enabled MUST be omitted from
  the emitted configuration when that parent is off, regardless of what is stored.
- **FR-010**: Settings that are meaningless in access-point mode MUST be omitted
  from an access point's emitted configuration.
- **FR-011**: The system MUST resolve VLAN ids itself: values the user typed are
  fixed, untouched values are auto-assigned to the lowest free id at or above
  their natural default, skipping taken and trunked ids. The assignment MUST be
  visible to the user before building.
- **FR-012**: The system MUST resolve interface names the same way, and MUST
  refuse names that the provisioning script or OpenWrt already owns.
- **FR-013**: Only genuinely unresolvable conflicts (two explicit values colliding,
  an explicit value hitting a trunked VLAN or a reserved name, or exhaustion) MUST
  block a build. Auto-reassignment MUST NOT.
- **FR-014**: The system MUST warn about, and adjust for, the limited hardware VLAN
  table on switch-based targets, reporting what was dropped.
- **FR-015**: The system MUST validate hostnames, dynamic-DNS names, MAC addresses,
  port lists and ranges, IPv6 host ids, network prefixes, country codes, interface
  names, numeric ranges, Wi-Fi password length, and characters that would corrupt
  the emitted tables — and MUST refuse a build while any visible field is invalid,
  attaching the explanation to that field.
- **FR-016**: When a shared-password VLAN scheme is enabled, the system MUST
  require the participating networks' Wi-Fi passwords to be distinct, since the
  password is what selects the network.
- **FR-017**: Users MUST be able to define port-forwarding entries and IPv6
  server-exposure entries as repeatable host / address / ports rows.
- **FR-018**: Users MUST be able to supply a free-form list of additional packages
  and a free-form custom script, both optional and both out of the primary flow.
- **FR-019**: Users MUST be able to pick a timezone by searching for it.
- **FR-020**: Users MUST be able to select ad-blocking country lists and threat
  feeds from searchable lists rather than typing identifiers.
- **FR-021**: The system MUST offer known encrypted-DNS providers as presets, and
  MUST derive the matching bootstrap resolver addresses from whichever providers
  are selected, so removing a provider removes its addresses.
- **FR-022**: The system MUST choose a DNS engine default appropriate to the
  selected hardware's flash and memory budget, and MUST NOT override a choice the
  user has made explicitly.
- **FR-023**: Settings unsupported by the selected release or hardware MUST be
  withheld, and any stored value for them cleared.

#### Building

- **FR-024**: The system MUST resolve the final package list in the browser from
  the stock set, the device set, the rules implied by the configuration, and the
  user's additions, with removal entries taking precedence, deduplicated and
  ordered deterministically.
- **FR-025**: The system MUST show the user the resolved package list before they
  build.
- **FR-026**: The system MUST fetch the provisioning script, split it on the
  section marker, prepend the locally rendered configuration, and POST the
  assembled result to the chosen build server as the defaults field.
- **FR-027**: The system MUST NOT send the assembled script, or any value within
  it, to any WrtNova-operated endpoint.
- **FR-028**: When the assembled script exceeds the build server's size limit, the
  system MUST compress the body while leaving the configuration readable, add the
  package needed to decode it, and report an actionable error only if it still
  does not fit.
- **FR-029**: The system MUST poll the build server until the image is ready,
  surfacing queue position and progress, and MUST present every produced image
  with its checksum and a link.
- **FR-030**: When a build is rejected for exceeding device storage, the system
  MUST retry once with the next-lighter DNS engine and state what it changed.
- **FR-031**: The system MUST let the user choose among build servers the operator
  has configured, and MUST fall back to the official one otherwise.
- **FR-032**: Repeated builds of an identical configuration MUST produce a
  byte-identical script, so the build server can serve a cached image.

#### History and persistence

- **FR-033**: The system MUST retain a bounded history of recent builds locally,
  each identifying its device, release, configuration, extra packages, and result.
- **FR-034**: History MUST NOT contain passwords, keys, or tokens.
- **FR-035**: Users MUST be able to restore a history entry into the form,
  including reconstructing values that are stored differently from how they are
  entered.
- **FR-036**: Restoring an entry whose release no longer exists MUST select the
  nearest available release rather than failing.

#### Fleet

- **FR-037**: Users MUST be able to create, rename, and delete named networks,
  each holding one shared configuration and a list of nodes, persisted locally.
- **FR-038**: Each node MUST carry its own hardware selection, role, name, and
  optional per-node release, plus overrides layered onto the shared configuration.
- **FR-039**: Access-point nodes MUST be assigned distinct management addresses
  automatically, and the resulting address MUST be visible per node.
- **FR-040**: Users MUST be able to inspect the resolved configuration for an
  individual node, with the same masking rules as the single-node builder.
- **FR-041**: Users MUST be able to build one node or every node, with independent
  per-node progress, results, and errors.

#### Tunnel prefill

- **FR-042**: Any page that can register a tunnel identity MUST establish a
  session on initialization.
- **FR-043**: Requesting prefill MUST populate the tunnel fields and enable the
  tunnel.
- **FR-044**: A tunnel identity obtained once MUST be reused on subsequent
  requests within the same context rather than creating a new one.
- **FR-045**: Rate-limit and configuration failures MUST be reported in plain
  language, and their absence MUST NOT affect the rest of the application.

#### Localization and presentation

- **FR-046**: The application MUST present in seven languages, selected from the
  browser by default and overridable by the user, with the choice remembered and
  English as the fallback for any missing string.
- **FR-047**: The application MUST support a light and a dark presentation, with
  the choice remembered.
- **FR-048**: The application MUST remain usable on a phone-sized screen.

### Key Entities

- **Configuration**: the complete set of settings for one device, expressed as
  string values where an absent value means "keep the provisioning script's
  default". The authoritative key list is Appendix A.
- **Device selection**: hardware identity resolved from the OpenWrt downloads
  server — release, target, profile, stock packages, device packages, images.
- **Build**: one submission to a build server — its request identity, progress,
  and either produced images or an error.
- **History entry**: a past build's device selection, configuration (without
  secrets), extra packages, and result.
- **Network**: a named fleet — one shared configuration plus an ordered list of
  nodes.
- **Node**: one device within a network — name, hardware selection, role
  (router or access point), and configuration overrides.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person who has never used OpenWrt can go from landing on
  `/builder` to a downloadable image for their own hardware, accepting defaults,
  in under three minutes and without opening external documentation.
- **SC-002**: Every configuration key in Appendix A is reachable in the interface,
  verified by an explicit audit; the count of unreachable keys is zero.
- **SC-003**: No configuration a user can produce through the interface emits a
  literal `0` for an off control, or a value equal to the provisioning script's
  own default.
- **SC-004**: No request carrying a user's password, passphrase, key, or token is
  ever sent to a WrtNova-operated origin, verified by inspecting network traffic
  during a full build.
- **SC-005**: Building the same configuration twice produces identical submitted
  content, so the second build is served from the build server's cache.
- **SC-006**: A user can build a router and three access points from one shared
  configuration in a single action, and a failure on one node does not stop the
  other three.
- **SC-007**: Every conflict class in User Story 6 is caught before submission,
  with an explanation the user can act on without knowing OpenWrt terminology.
- **SC-008**: All interface text is available in all seven supported languages;
  the count of strings present in English but missing elsewhere is zero.
- **SC-009**: Every primary task can be completed on a 375 px-wide screen.
- **SC-010**: A returning user can reproduce a previous build in under thirty
  seconds.

## Assumptions

- The OpenWrt downloads server and the chosen ASU build server remain reachable
  from the browser with permissive cross-origin policy, as today.
- The tunnel-prefill backend is operator-supplied and optional; its absence
  degrades one feature and nothing else.
- Configuration, history, and fleet data are per-browser. No account system, no
  server-side storage, and no cross-device sync are in scope.
- The provisioning script's variable set is stable for the duration of this work;
  keys are added to it by the user, not by this rewrite.
- The free-form additional-packages capability rescued from the dropped advanced
  page is folded into `/builder` behind a disclosure, alongside the existing
  custom-script field and a custom build-server address. The raw script editor
  itself is not replaced.
- Configuration keys that exist in the provisioning script but were never exposed
  by the previous frontend (Appendix B) remain unexposed; the custom-script field
  is the escape hatch for them.
- "Usable on a phone" is a design commitment, not a release gate with a numeric
  threshold.

## Appendix A — Configuration key coverage

Every key below MUST have a home in the new interface. Keys marked *(build-only)*
influence package selection and are never written into the configuration block.
Keys marked *(derived)* are computed, not entered. Keys marked *(UI-only)* are
entry conveniences that are transformed before emission.

**Identity and access** — `HOST_NAME`, `ROOT_PASSWD`, `SSH_PUBLIC_KEY`,
`SSH_PASSWD_AUTH`, `ZONE_NAME`, `TIME_ZONE`, `TIME_FORMAT`

**Role** — `AP_MODE`, `AP_INDEX`, `AP_DISABLE`, `INDEX_SUFFIX`

**Upstream / WAN** — `wan_type` *(UI-only)*, `PPPOE_USERNAME`, `PPPOE_PASSWD`,
`WAN_MAC_ADDR`, `WAN_IS_TAGGED`, `WAN_VLAN_ID`, `WAN_B_ENABLE`, `WAN_B_VLAN_ID`,
`BRIDGE_WAN_PORT`, `CELLULAR_MODEM`, `USB_TETHERING`

**Networks and VLANs** — `BASE_NET_PREFIX`, `DEFAULT_SUBNET`, `GUEST_ENABLE`,
`IOT_ENABLE`, `IOT_INTERNET`, `IOT_ROUTE_VIA_WG`, `LAN_BASE_PREFIX`, `LAN_IFACE`,
`LAN_VLAN_ID`, `LAN_SUBNET`, `GUEST_BASE_PREFIX`, `GUEST_IFACE`, `GUEST_VLAN_ID`,
`GUEST_SUBNET`, `IOT_BASE_PREFIX`, `IOT_IFACE`, `IOT_VLAN_ID`, `IOT_SUBNET`,
`LAN_VPN_BASE_PREFIX`, `LAN_VPN_IFACE`, `LAN_VPN_VLAN_ID`, `LAN_VPN_SUBNET`,
`ADDITIONAL_VLAN_LIST`, `TAGGED_LAN_VLAN`, `BRIDGE_STP`, `P_STEERING`,
`ULA_PREFIX`

**Wireless** — `COUNTRY_CODE`, `DOT11KV`, `DOT11R`, `DENSE_ENV`, `PSK_VLAN`,
`BAND_SUFFIX`, `LAN_WIFI_SSID`, `LAN_WIFI_PASSWD`, `GUEST_WIFI_SSID`,
`GUEST_WIFI_PASSWD`, `GUEST_ISOLATE`, `IOT_WIFI_SSID`, `IOT_WIFI_PASSWD`,
`IOT_NO_DOT11R` *(UI-only: entered as the positive)*, `LAN_VPN_WIFI_SSID`,
`LAN_VPN_WIFI_PASSWD`, `CHANNEL_2G`, `CHANNEL_5G`, `CHANNEL_5G_2`, `CHANNEL_6G`,
`WIFI_LOG_LVL`, `WED_ENABLE`

**Mesh backhaul** — `WIRELESS_MESH`, `WIRELESS_MESH_2G`, `BATMAN_ADV`,
`BATMAN_ALL_VLAN`, `MESH_ID`, `MESH_PASSWD`

**WireGuard client** — `WG_ENABLE`, `WG_PRIVATE_KEY`, `PEER_PUBLIC_KEY`,
`ENDPOINT` *(UI-only: entered as `host:port`)*, `ENDPOINT_PORT` *(derived)*,
`PRESHARED_KEY`, `WG_IPV4`, `WG_IPV6`, `WG_DNS_V4`, `WG_DNS_V6`, `WG_MTU`,
`ALLOWED_IPS`, `SPLIT_TUNNEL_V4`, `SPLIT_TUNNEL_V6`

**Exposure** — `PORT_FORWARD_LIST`, `IPV6_SERVER_LIST`

**Dynamic DNS** — `DDNS_ENABLE`, `LOOKUP_HOSTNAME`, `CLOUDFLARE_API_KEY`

**DNS and filtering** — `DNS_MODE` *(build-only)*, `ADGUARD_MAIN_DNS`,
`ADGUARD_PASSWD` *(derived from the root password)*, `DOH_UPSTREAMS`,
`BOOTSTRAP_DNS` *(partly derived from the selected providers)*,
`DNSMASQ_MULTI_INSTANCE` *(UI-only)*, `DNSMASQ_SINGLE_INSTANCE` *(derived)*,
`FORCE_DNS`, `BLOCK_DOT_DOQ`, `BLOCK_DOH`, `BANIP_COUNTRY_LIST`, `BANIP_FEEDS`

**Performance and maintenance** — `SOFTWARE_OFFLOAD`, `HARDWARE_OFFLOAD`,
`IRQBALANCE` *(build-only)*, `NON_CT_ATH10K` *(build-only)*, `LUCI_HTTPS`,
`NTP_IP`, `QUARTERLY_REBOOT`, `DENY_GUEST_NIGHT`, `LOG`

**Escape hatches** — `CUSTOM_SCRIPT`, additional packages *(build-only)*

## Appendix B — Provisioning-script keys intentionally not exposed

These exist in the provisioning script but were not offered by the previous
frontend and remain unoffered. Users needing them use the custom-script field.

`DEFAULT_WIFI_PASSWD`, `LAN_DHCP_START`, `GUEST_DHCP_START`, `WG_IFACE`,
`MODEM_PATH`, `MODEM_APN`
