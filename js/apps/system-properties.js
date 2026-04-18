// js/apps/system-properties.js
// Full System Properties dialog (SYSDM.CPL simulation).
// Spec: CLAUDE.md § Win98 Behavioral Fidelity — System Properties Dialog (doc 2e3b940e).
// Called from desktop.js: window.APC.systemProperties.buildContent(contentEl, closeCallback)
//
// Architecture: builds tab UI into the content area of a window shell managed by desktop.js.
// Nested Properties and Remove dialogs are self-managed overlays with focus traps.

window.APC = window.APC || {};

window.APC.systemProperties = (function () {
  'use strict';

  // Tracks PM device interaction per open session for Umami easteregg_trigger.
  // Reset at the top of buildContent so each dialog open is a fresh session.
  var pmInteracted = false;

  // -------------------------------------------------------------------------
  // PM device definitions — exact copy per spec; do not paraphrase any string
  // -------------------------------------------------------------------------

  var PM_DEVICES = [
    {
      name: 'Backlog Manager Pro',
      status: 'warn',
      tooltip: 'Queue full. Items added faster than removed.',
      removeMsg: 'Removing this device will not delete existing items. They will remain,' +
                 ' ungroomed, in system memory indefinitely.',
      propsTabs: ['General', 'Settings'],
      general: {
        type: 'Storage Controller',
        mfr: 'Unknown',
        status: 'This device is functioning but operating at critical capacity. Items are being' +
                ' added to the queue faster than they can be processed. No resolution date available.'
      },
      settings: true  // flag: build the Backlog settings pane
    },
    {
      name: 'Confidence.dll',
      status: 'warn',
      tooltip: 'Works fine in demo environments only.',
      removeMsg: 'Warning: Removing Confidence.dll may affect the performance of other system' +
                 ' processes. Proceed only in environments where this will not be noticed.',
      propsTabs: ['General', 'Driver'],
      general: {
        type: 'System File',
        mfr: 'Unknown',
        status: 'This device is working properly. Note: Device performance may vary significantly' +
                ' depending on environment. Optimal performance observed in: demo settings,' +
                ' low-stakes environments, and casual Fridays.'
      },
      driver: {
        version: '1.0.0 (stable in theory)',
        date: 'Varies',
        updateAction: 'confidence'
      }
    },
    {
      name: 'Imposter Syndrome Controller',
      status: 'warn',
      tooltip: 'Intermittent signal detected.',
      removeMsg: 'This device cannot be fully removed. Imposter Syndrome will always be in the' +
                 ' back of the mind.',
      propsTabs: ['General'],  // single tab only — restraint is the joke
      general: {
        type: 'Unknown',
        mfr: 'Unknown',
        status: 'This device is working properly. (Probably.)'
      }
    },
    {
      name: 'Sprint Velocity Controller',
      status: 'err',
      tooltip: 'Unexpected dependency detected on Friday at 4:58 PM.',
      removeMsg: 'Device removal has been added to the backlog. Expected completion: next sprint.',
      propsTabs: ['General', 'Driver', 'Resources'],
      general: {
        type: 'Performance Controller',
        mfr: 'Agile Systems Inc.',
        status: 'Windows has detected a critical failure. An unexpected dependency was introduced' +
                ' on Friday at 4:58 PM. This device has been disabled to prevent further damage' +
                ' to the sprint. Code: SCOPE_CREEP_DETECTED (0x0000002A)'
      },
      driver: {
        version: '2.0 (downgraded from 3.0 after Sprint 12 incident)',
        date: 'Friday',
        updateGrayed: true,
        updateTooltip: 'Cannot update driver mid-sprint.'
      },
      resources: [
        { label: 'IRQ',         value: '14 (conflicting with Stakeholder Alignment Service)' },
        { label: 'I/O Range',   value: 'Negotiable, pending retro' },
        { label: 'DMA Channel', value: 'Not yet assigned. Added to backlog.' }
      ]
    },
    {
      name: 'Stakeholder Alignment Service',
      status: 'err',
      tooltip: 'Device disabled. Conflict with 23 other devices.',
      removeMsg: 'Removal requires approval from 23 stakeholders. Request has been submitted.' +
                 ' You will be notified.',
      propsTabs: ['General', 'Driver'],
      general: {
        type: 'Unknown',
        mfr: 'Unknown',
        status: 'Windows cannot load the device driver. There are 23 conflicting devices' +
                ' requesting the same resources.'
      },
      driver: {
        version: 'v0.9 BETA (has been v0.9 BETA since 2019)',
        updateGrayed: true,
        updateTooltip: 'Driver update requires sign-off from 23 stakeholders.'
      }
    },
    {
      name: 'Story Point Estimator',
      status: 'warn',
      tooltip: 'Returned value: 3. Actual value: 13.',
      removeMsg: 'Estimated time to remove: 2 minutes. Actual time to remove: unknown.',
      propsTabs: ['General', 'Driver', 'Resources'],
      general: {
        // uses description field instead of type/mfr
        description: 'Fibonacci Sequence Engine v1.0',
        status: 'Last known output: 3. Actual recorded output: 13. Root cause under investigation' +
                ' since Sprint 4.'
      },
      driver: { version: '\u221E' },  // ∞
      resources: [
        { label: 'IRQ',       value: '\u221E' },
        { label: 'I/O Range', value: 'To be determined in next sprint' }
      ]
    }
  ];

  // Real device class nodes — no interactive children, collapsible only
  var REAL_BEFORE_PM = [
    'Computer',
    'Disk drives',
    'Display adapters',
    'Hard disk controllers',
    'Keyboard',
    'Mice and other pointing devices',
    'Network adapters',
    'Ports (COM & LPT)',
    'Sound, video and game controllers'
  ];
  var REAL_AFTER_PM = [
    'System devices',
    'Universal Serial Bus controllers'
  ];

  // -------------------------------------------------------------------------
  // Main content builder — called by desktop.js
  // -------------------------------------------------------------------------

  function buildContent(contentEl, closeCallback) {
    pmInteracted = false;  // fresh session per open
    contentEl.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'sysprops-wrap';

    // --- Tab bar ---
    var tabBar = document.createElement('div');
    tabBar.className = 'sysprops-tab-bar';
    tabBar.setAttribute('role', 'tablist');

    var tabDefs = [
      { name: 'General',           build: buildGeneralTab        },
      { name: 'Device Manager',    build: buildDeviceManagerTab  },
      { name: 'Hardware Profiles', build: buildHardwareProfilesTab },
      { name: 'Performance',       build: buildPerformanceTab    }
    ];

    var tabEls   = [];
    var panelEls = [];

    function activateTab(idx) {
      tabEls.forEach(function (t, i) {
        t.className = 'sysprops-tab' + (i === idx ? ' sysprops-tab--active' : '');
        t.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        t.setAttribute('tabindex', i === idx ? '0' : '-1');
      });
      panelEls.forEach(function (p, i) {
        p.style.display = i === idx ? '' : 'none';
      });
    }

    tabDefs.forEach(function (def, i) {
      var tab = document.createElement('button');
      tab.className = 'sysprops-tab' + (i === 0 ? ' sysprops-tab--active' : '');
      tab.textContent = def.name;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      tab.setAttribute('tabindex', i === 0 ? '0' : '-1');
      tab.setAttribute('aria-controls', 'sysprops-panel-' + i);
      (function (idx) {
        tab.addEventListener('click', function () { activateTab(idx); });
        tab.addEventListener('keydown', function (e) {
          var next = (idx + 1) % tabDefs.length;
          var prev = (idx - 1 + tabDefs.length) % tabDefs.length;
          if (e.key === 'ArrowRight') { activateTab(next); tabEls[next].focus(); }
          if (e.key === 'ArrowLeft')  { activateTab(prev); tabEls[prev].focus(); }
        });
      }(i));
      tabBar.appendChild(tab);
      tabEls.push(tab);
    });

    var tabClear = document.createElement('div');
    tabClear.style.clear = 'both';
    tabBar.appendChild(tabClear);

    // --- Tab panels ---
    var panel = document.createElement('div');
    panel.className = 'sysprops-panel';

    tabDefs.forEach(function (def, i) {
      var pane = document.createElement('div');
      pane.id = 'sysprops-panel-' + i;
      pane.setAttribute('role', 'tabpanel');
      pane.style.display = i === 0 ? '' : 'none';
      def.build(pane);
      panel.appendChild(pane);
      panelEls.push(pane);
    });

    // --- OK / Cancel ---
    var btnRow = document.createElement('div');
    btnRow.className = 'sysprops-btnrow';

    ['OK', 'Cancel'].forEach(function (label) {
      var btn = document.createElement('button');
      btn.className = 'sysprops-btn';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        var t = window.APC.timing;
        setTimeout(function () {
          if (pmInteracted && window.umami) {
            window.umami.track('easteregg_trigger', { easter_egg: 'system_properties_pm' });
          }
          closeCallback();
        }, t.rand(t.SYSPROPS_CLOSE_MIN_MS, t.SYSPROPS_CLOSE_MAX_MS));
      });
      btnRow.appendChild(btn);
    });

    wrap.appendChild(tabBar);
    wrap.appendChild(panel);
    wrap.appendChild(btnRow);
    contentEl.appendChild(wrap);
  }

  // -------------------------------------------------------------------------
  // General tab
  // -------------------------------------------------------------------------

  function buildGeneralTab(pane) {
    var tbl = document.createElement('table');
    tbl.className = 'sysprops-general';
    tbl.setAttribute('cellpadding', '0');
    tbl.setAttribute('cellspacing', '0');
    var tbody = document.createElement('tbody');
    var tr    = document.createElement('tr');

    // Left: system icon
    var tdL = document.createElement('td');
    tdL.className = 'sysprops-general__icon';
    var iconSpan = document.createElement('span');
    iconSpan.textContent = '\uD83D\uDCBB';  // 💻
    iconSpan.setAttribute('aria-hidden', 'true');
    tdL.appendChild(iconSpan);

    // Right: OS + registration + hardware fields
    var tdR = document.createElement('td');
    tdR.className = 'sysprops-general__info';

    var lines = [
      { bold: true,  text: 'Microblob WinDoors 98'                           },
      { bold: false, text: '4.10.1998'                                        },
      { bold: false, text: '\u00A9 Copyright Microblob Corp 1981-1998.'      },
      { bold: false, text: '\u00A0'                                          },
      { bold: false, text: 'This product is licensed to:'                   },
      { bold: true,  text: 'Atsushi Hisaka'                                  },
      { bold: false, text: 'Product ID: 24796-OEM-0014736-00000'            },
      { bold: false, text: '\u00A0'                                          },
      { bold: true,  text: 'IBM'                                             },
      { bold: false, text: 'Intel Pentium II Processor Intel MMX(TM) Technology' },
      { bold: false, text: '450MHz, 128.0MB RAM'                            }
    ];

    lines.forEach(function (line) {
      var p = document.createElement('p');
      p.className = 'sysprops-general__line' +
                    (line.bold ? ' sysprops-general__line--bold' : '');
      p.textContent = line.text;
      tdR.appendChild(p);
    });

    tr.appendChild(tdL);
    tr.appendChild(tdR);
    tbody.appendChild(tr);
    tbl.appendChild(tbody);
    pane.appendChild(tbl);

    // About This Machine — recessed sunken inset box (#808080 border, bold header)
    var aboutBox = document.createElement('div');
    aboutBox.className = 'sysprops-about-box';

    var aboutHdr = document.createElement('p');
    aboutHdr.className = 'sysprops-about-box__header';
    aboutHdr.textContent = 'About This Machine';
    aboutBox.appendChild(aboutHdr);

    [
      'IBM Aptiva SE7 \u2014 Retail price: $3,299 (1998)',
      'Equivalent to approximately $6,200 in 2024.',
      'This was the fastest consumer PC money could buy.',
      '56K modem advertised at 56 kbps. Actual speed: ~30 kbps.',
      'You are browsing the internet exactly as fast as the best hardware of 1998 allowed.'
    ].forEach(function (text) {
      var p = document.createElement('p');
      p.className = 'sysprops-about-box__line';
      p.textContent = text;
      aboutBox.appendChild(p);
    });

    pane.appendChild(aboutBox);
  }

  // -------------------------------------------------------------------------
  // Device Manager tab
  // -------------------------------------------------------------------------

  function buildDeviceManagerTab(pane) {
    var selectedDevice = null;
    var propsBtn, removeBtn;

    // "View by" radio buttons
    var radioRow = document.createElement('div');
    radioRow.className = 'sysprops-radio-row';
    ['View devices by type', 'View devices by connection'].forEach(function (label, i) {
      var lbl = document.createElement('label');
      lbl.className = 'sysprops-radio-label';
      var radio = document.createElement('input');
      radio.type  = 'radio';
      radio.name  = 'dm-view';
      radio.value = i === 0 ? 'type' : 'connection';
      if (i === 0) { radio.checked = true; }
      lbl.appendChild(radio);
      lbl.appendChild(document.createTextNode(' ' + label));
      radioRow.appendChild(lbl);
    });
    pane.appendChild(radioRow);

    // Device tree
    var treeEl = document.createElement('div');
    treeEl.className = 'sysprops-device-tree';
    treeEl.setAttribute('role', 'tree');
    treeEl.setAttribute('aria-label', 'Hardware devices');

    function setSelected(device) {
      // Clear any previous selection highlight
      treeEl.querySelectorAll('.sysprops-device-item--selected').forEach(function (el) {
        el.classList.remove('sysprops-device-item--selected');
      });
      selectedDevice = device;
      propsBtn.disabled  = !device;
      removeBtn.disabled = !device;
    }

    REAL_BEFORE_PM.forEach(function (name) {
      treeEl.appendChild(buildRealNode(name, setSelected));
    });

    // Product Management node embedded mid-list — no visual distinction from real nodes
    treeEl.appendChild(buildPMNode(setSelected));

    REAL_AFTER_PM.forEach(function (name) {
      treeEl.appendChild(buildRealNode(name, setSelected));
    });

    pane.appendChild(treeEl);

    // Action buttons (Properties, Refresh, Remove, Print)
    var dmBtns = document.createElement('div');
    dmBtns.className = 'sysprops-dm-btns';

    propsBtn = makeSyspropsBtn('Properties', function () {
      if (!selectedDevice) { return; }
      pmInteracted = true;
      openPropertiesDialog(selectedDevice);
    });
    propsBtn.disabled = true;

    var refreshBtn = makeSyspropsBtn('Refresh', function () { /* no-op stub */ });

    removeBtn = makeSyspropsBtn('Remove', function () {
      if (!selectedDevice) { return; }
      pmInteracted = true;
      var dev = selectedDevice;
      openRemoveDialog(dev, function () { setSelected(null); });
    });
    removeBtn.disabled = true;

    var printBtn = makeSyspropsBtn('Print', function () { /* no-op stub */ });

    dmBtns.appendChild(propsBtn);
    dmBtns.appendChild(refreshBtn);
    dmBtns.appendChild(removeBtn);
    dmBtns.appendChild(printBtn);
    pane.appendChild(dmBtns);
  }

  function buildRealNode(name, setSelected) {
    var wrap = document.createElement('div');
    wrap.className = 'sysprops-device-node';
    wrap.setAttribute('role', 'treeitem');
    wrap.setAttribute('aria-expanded', 'false');

    var row = document.createElement('div');
    row.className = 'sysprops-device-item sysprops-device-item--class';
    row.setAttribute('tabindex', '0');

    var toggle = document.createElement('span');
    toggle.className = 'sysprops-device-toggle';
    toggle.setAttribute('aria-hidden', 'true');
    toggle.textContent = '[+]';

    var icon = document.createElement('span');
    icon.className = 'sysprops-device-class-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\uD83D\uDCBB';  // 💻

    var label = document.createElement('span');
    label.textContent = name;

    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(label);
    wrap.appendChild(row);

    // Children container — empty for real nodes (no sub-devices rendered)
    var children = document.createElement('div');
    children.className = 'sysprops-device-children';
    children.style.display = 'none';
    wrap.appendChild(children);

    var expanded = false;
    function toggleExpand(e) {
      if (e) { e.stopPropagation(); }
      expanded = !expanded;
      toggle.textContent = expanded ? '[\u2212]' : '[+]';
      children.style.display = expanded ? '' : 'none';
      wrap.setAttribute('aria-expanded', String(expanded));
    }

    toggle.addEventListener('click', toggleExpand);
    row.addEventListener('click', function () {
      // Real nodes: highlight row but don't enable Properties/Remove
      setSelected(null);
      row.classList.add('sysprops-device-item--selected');
    });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { toggleExpand(); e.preventDefault(); }
    });

    return wrap;
  }

  function buildPMNode(setSelected) {
    var wrap = document.createElement('div');
    wrap.className = 'sysprops-device-node';
    wrap.setAttribute('role', 'treeitem');
    wrap.setAttribute('aria-expanded', 'false');

    var row = document.createElement('div');
    row.className = 'sysprops-device-item sysprops-device-item--class';
    row.setAttribute('tabindex', '0');

    var toggle = document.createElement('span');
    toggle.className = 'sysprops-device-toggle';
    toggle.setAttribute('aria-hidden', 'true');
    toggle.textContent = '[+]';

    var icon = document.createElement('span');
    icon.className = 'sysprops-device-class-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\uD83D\uDCBC';  // 💼

    var labelSpan = document.createElement('span');
    labelSpan.textContent = 'Product Management';

    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(labelSpan);
    wrap.appendChild(row);

    var children = document.createElement('div');
    children.className = 'sysprops-device-children';
    children.style.display = 'none';
    wrap.appendChild(children);

    PM_DEVICES.forEach(function (device) {
      var childWrap = document.createElement('div');
      childWrap.className = 'sysprops-device-node sysprops-device-node--child';
      childWrap.setAttribute('role', 'treeitem');

      var childRow = document.createElement('div');
      childRow.className = 'sysprops-device-item sysprops-device-item--device';
      childRow.setAttribute('tabindex', '0');
      childRow.setAttribute('aria-label', device.name + ': ' + device.tooltip);
      childRow.title = device.tooltip;

      var statusIcon = document.createElement('span');
      statusIcon.className = 'sysprops-status-icon sysprops-status-icon--' + device.status;
      statusIcon.setAttribute('aria-hidden', 'true');
      // warn → yellow ! circle, err → red X (rendered in CSS via background/color)
      statusIcon.textContent = device.status === 'warn' ? '!' : '\u00D7';

      var devIcon = document.createElement('span');
      devIcon.className = 'sysprops-device-class-icon';
      devIcon.setAttribute('aria-hidden', 'true');
      devIcon.textContent = '\uD83D\uDCBE';  // 💾

      var devLabel = document.createElement('span');
      devLabel.textContent = device.name;

      childRow.appendChild(statusIcon);
      childRow.appendChild(devIcon);
      childRow.appendChild(devLabel);
      childWrap.appendChild(childRow);

      (function (dev) {
        childRow.addEventListener('click', function (e) {
          e.stopPropagation();
          setSelected(dev);
          childRow.classList.add('sysprops-device-item--selected');
        });
        childRow.addEventListener('dblclick', function () {
          pmInteracted = true;
          openPropertiesDialog(dev);
        });
        childRow.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            pmInteracted = true;
            openPropertiesDialog(dev);
            e.preventDefault();
          }
        });
      }(device));

      children.appendChild(childWrap);
    });

    var expanded = false;
    function toggleExpand(e) {
      if (e) { e.stopPropagation(); }
      expanded = !expanded;
      toggle.textContent = expanded ? '[\u2212]' : '[+]';
      children.style.display = expanded ? '' : 'none';
      wrap.setAttribute('aria-expanded', String(expanded));
    }

    toggle.addEventListener('click', toggleExpand);
    row.addEventListener('click', function () { setSelected(null); });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { toggleExpand(); e.preventDefault(); }
    });

    return wrap;
  }

  // -------------------------------------------------------------------------
  // Hardware Profiles tab
  // -------------------------------------------------------------------------

  function buildHardwareProfilesTab(pane) {
    var list = document.createElement('div');
    list.className = 'sysprops-hw-list';
    var item = document.createElement('div');
    item.className = 'sysprops-hw-item';
    item.textContent = 'Original Configuration';
    list.appendChild(item);
    pane.appendChild(list);
  }

  // -------------------------------------------------------------------------
  // Performance tab
  // -------------------------------------------------------------------------

  function buildPerformanceTab(pane) {
    var msg = document.createElement('p');
    msg.className = 'sysprops-perf-msg';
    msg.textContent = 'Your system is configured for optimal performance.';
    pane.appendChild(msg);

    // File System... and Virtual Memory... — non-functional stubs per CLAUDE.md override
    var stubRow = document.createElement('div');
    stubRow.className = 'sysprops-perf-stubs';
    ['File System...', 'Virtual Memory...'].forEach(function (label) {
      var btn = document.createElement('button');
      btn.className = 'sysprops-btn';
      btn.textContent = label;
      // No click handler — non-functional per Resolved Spec Decision
      stubRow.appendChild(btn);
    });
    pane.appendChild(stubRow);
  }

  // -------------------------------------------------------------------------
  // Remove dialog
  // -------------------------------------------------------------------------

  function openRemoveDialog(device, onRemoved) {
    var overlay = buildOverlay();
    var box     = buildNestedDialog();

    buildTitlebar(box, device.name + ' \u2014 Remove Device', function () { closeRemove(); });

    var body = document.createElement('div');
    body.className = 'sysprops-nested-dialog__body';

    var msg = document.createElement('p');
    msg.className = 'sysprops-nested-dialog__msg';
    msg.textContent = device.removeMsg;
    body.appendChild(msg);

    // Single right-aligned OK button only — "Windows has made up its mind"
    var btnRow = document.createElement('div');
    btnRow.className = 'sysprops-btnrow';
    var okBtn = makeSyspropsBtn('OK', function () { closeRemove(); });
    btnRow.appendChild(okBtn);
    body.appendChild(btnRow);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    okBtn.focus();

    function closeRemove() {
      removeOverlay(overlay, onKeyRemove);
      showToast('Removal requested \u2014 operation simulated');
      if (onRemoved) { onRemoved(); }
    }
    var onKeyRemove = makeTrapHandler(box, closeRemove);
    document.addEventListener('keydown', onKeyRemove);
  }

  // -------------------------------------------------------------------------
  // Properties dialog
  // -------------------------------------------------------------------------

  function openPropertiesDialog(device) {
    var overlay = buildOverlay();
    var box     = buildNestedDialog('sysprops-nested-dialog--props');

    buildTitlebar(box, device.name + ' Properties', function () { closeProps(); });

    // Tab bar
    var tabBar  = document.createElement('div');
    tabBar.className = 'sysprops-tab-bar';
    tabBar.setAttribute('role', 'tablist');

    var pTabEls   = [];
    var pPanelEls = [];

    function activatePTab(idx) {
      pTabEls.forEach(function (t, i) {
        t.className = 'sysprops-tab' + (i === idx ? ' sysprops-tab--active' : '');
        t.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        t.setAttribute('tabindex', i === idx ? '0' : '-1');
      });
      pPanelEls.forEach(function (p, i) {
        p.style.display = i === idx ? '' : 'none';
      });
    }

    device.propsTabs.forEach(function (tabName, i) {
      var tab = document.createElement('button');
      tab.className = 'sysprops-tab' + (i === 0 ? ' sysprops-tab--active' : '');
      tab.textContent = tabName;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      tab.setAttribute('tabindex', i === 0 ? '0' : '-1');
      (function (idx) {
        tab.addEventListener('click', function () { activatePTab(idx); });
        tab.addEventListener('keydown', function (e) {
          var next = (idx + 1) % device.propsTabs.length;
          var prev = (idx - 1 + device.propsTabs.length) % device.propsTabs.length;
          if (e.key === 'ArrowRight') { activatePTab(next); pTabEls[next].focus(); }
          if (e.key === 'ArrowLeft')  { activatePTab(prev); pTabEls[prev].focus(); }
        });
      }(i));
      tabBar.appendChild(tab);
      pTabEls.push(tab);
    });
    var tabClear = document.createElement('div');
    tabClear.style.clear = 'both';
    tabBar.appendChild(tabClear);

    // Panel
    var panel = document.createElement('div');
    panel.className = 'sysprops-panel';

    device.propsTabs.forEach(function (tabName, i) {
      var pane = document.createElement('div');
      pane.setAttribute('role', 'tabpanel');
      pane.style.display = i === 0 ? '' : 'none';

      if      (tabName === 'General')   { buildPropsGeneral(pane, device);  }
      else if (tabName === 'Driver')    { buildPropsDriver(pane, device);   }
      else if (tabName === 'Resources') { buildPropsResources(pane, device);}
      else if (tabName === 'Settings')  { buildPropsSettings(pane);        }

      panel.appendChild(pane);
      pPanelEls.push(pane);
    });

    // OK / Cancel
    var btnRow = document.createElement('div');
    btnRow.className = 'sysprops-btnrow';
    ['OK', 'Cancel'].forEach(function (label) {
      var btn = makeSyspropsBtn(label, function () { closeProps(); });
      btnRow.appendChild(btn);
    });

    box.appendChild(tabBar);
    box.appendChild(panel);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Focus the first tab on open
    if (pTabEls[0]) { pTabEls[0].focus(); }

    function closeProps() { removeOverlay(overlay, onKeyProps); }
    var onKeyProps = makeTrapHandler(box, closeProps);
    document.addEventListener('keydown', onKeyProps);
  }

  // --- Properties tab pane builders ---

  function buildPropsGeneral(pane, device) {
    var g = device.general;
    if (g.description) {
      addField(pane, 'Device description:', g.description);
    } else {
      if (g.type) { addField(pane, 'Device type:',    g.type); }
      if (g.mfr)  { addField(pane, 'Manufacturer:',  g.mfr);  }
    }

    var statusBox = document.createElement('div');
    statusBox.className = 'sysprops-props-status-box';

    var statusLbl = document.createElement('p');
    statusLbl.className = 'sysprops-props-status-label';
    statusLbl.textContent = 'Device status';

    var statusMsg = document.createElement('p');
    statusMsg.className = 'sysprops-props-status-msg';
    statusMsg.textContent = g.status;

    statusBox.appendChild(statusLbl);
    statusBox.appendChild(statusMsg);
    pane.appendChild(statusBox);
  }

  function buildPropsDriver(pane, device) {
    var d = device.driver || {};
    if (d.version) { addField(pane, 'Driver version:', d.version); }
    if (d.date)    { addField(pane, 'Driver date:',    d.date);    }

    var updateBtn = makeSyspropsBtn('Update Driver', function () {
      if (d.updateAction === 'confidence') {
        showSmallAlert(
          'Update Driver',
          'Windows was unable to find a better driver for Confidence.dll.' +
          ' Your current driver is the best available. You\'re doing great.'
        );
      }
    });

    if (d.updateGrayed) {
      updateBtn.disabled = true;
      if (d.updateTooltip) { updateBtn.title = d.updateTooltip; }
    }

    var driverBtnRow = document.createElement('div');
    driverBtnRow.className = 'sysprops-props-driver-row';
    driverBtnRow.appendChild(updateBtn);
    pane.appendChild(driverBtnRow);
  }

  function buildPropsResources(pane, device) {
    if (!device.resources) { return; }
    device.resources.forEach(function (entry) {
      addField(pane, entry.label + ':', entry.value);
    });
  }

  function buildPropsSettings(pane) {
    // Backlog Manager Pro Settings tab only
    var depthRow = addField(pane, 'Queue depth:', '[FULL]');
    depthRow.classList.add('sysprops-props-field--disabled');

    var cbLabel = document.createElement('label');
    cbLabel.className = 'sysprops-props-field';
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = true; cb.disabled = true;
    cbLabel.appendChild(cb);
    cbLabel.appendChild(document.createTextNode(' Enable auto-prioritization'));
    pane.appendChild(cbLabel);

    var clearBtnRow = document.createElement('div');
    clearBtnRow.className = 'sysprops-props-driver-row';
    var clearBtn = makeSyspropsBtn('Clear Queue', function () { showClearQueueConfirm(); });
    clearBtnRow.appendChild(clearBtn);
    pane.appendChild(clearBtnRow);
  }

  // -------------------------------------------------------------------------
  // Clear Queue flow: confirm → progress bar freezes at 97%
  // -------------------------------------------------------------------------

  function showClearQueueConfirm() {
    var overlay = buildOverlay();
    var box     = buildNestedDialog();

    buildTitlebar(box, 'Backlog Manager Pro', function () { closeCQ(); });

    var body = document.createElement('div');
    body.className = 'sysprops-nested-dialog__body';
    var msg = document.createElement('p');
    msg.className = 'sysprops-nested-dialog__msg';
    msg.textContent = 'Are you sure? This action cannot be undone and will require re-grooming.';
    body.appendChild(msg);

    var btnRow = document.createElement('div');
    btnRow.className = 'sysprops-btnrow';
    var okBtn     = makeSyspropsBtn('OK',     function () { closeCQ(); showProgressDialog(); });
    var cancelBtn = makeSyspropsBtn('Cancel', function () { closeCQ(); });
    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);
    body.appendChild(btnRow);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    okBtn.focus();

    function closeCQ() { removeOverlay(overlay, onKeyCQ); }
    var onKeyCQ = makeTrapHandler(box, function () { closeCQ(); });
    document.addEventListener('keydown', onKeyCQ);
  }

  function showProgressDialog() {
    var overlay = buildOverlay();
    var box     = buildNestedDialog();

    // No X button on the progress dialog — it freezes at 97% intentionally
    var tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';
    var titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.textContent = 'Clearing Queue';
    tb.appendChild(titleSpan);
    box.appendChild(tb);

    var body = document.createElement('div');
    body.className = 'sysprops-nested-dialog__body';
    var msg = document.createElement('p');
    msg.className = 'sysprops-nested-dialog__msg';
    msg.textContent = 'Clearing backlog items...';
    body.appendChild(msg);

    var barOuter = document.createElement('div');
    barOuter.className = 'sysprops-progress-bar';
    var barFill = document.createElement('div');
    barFill.className = 'sysprops-progress-fill';
    barFill.style.width = '0%';
    barOuter.appendChild(barFill);
    body.appendChild(barOuter);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Fill to 97% then freeze — no close path, deliberate
    var pct = 0;
    var fillTimer = setInterval(function () {
      pct += (2 + Math.random() * 6);
      if (pct >= 97) {
        pct = 97;
        barFill.style.width = '97%';
        clearInterval(fillTimer);
        return;
      }
      barFill.style.width = pct + '%';
    }, 80);
  }

  // -------------------------------------------------------------------------
  // Small alert (Update Driver for Confidence.dll)
  // -------------------------------------------------------------------------

  function showSmallAlert(title, message) {
    var overlay = buildOverlay();
    var box     = buildNestedDialog();

    buildTitlebar(box, title, function () { closeSA(); });

    var body = document.createElement('div');
    body.className = 'sysprops-nested-dialog__body';
    var msg = document.createElement('p');
    msg.className = 'sysprops-nested-dialog__msg';
    msg.textContent = message;
    body.appendChild(msg);
    var btnRow = document.createElement('div');
    btnRow.className = 'sysprops-btnrow';
    var okBtn = makeSyspropsBtn('OK', function () { closeSA(); });
    btnRow.appendChild(okBtn);
    body.appendChild(btnRow);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    okBtn.focus();

    function closeSA() { removeOverlay(overlay, onKeySA); }
    var onKeySA = makeTrapHandler(box, closeSA);
    document.addEventListener('keydown', onKeySA);
  }

  // -------------------------------------------------------------------------
  // Toast
  // -------------------------------------------------------------------------

  function showToast(message) {
    var toast = document.createElement('div');
    toast.className = 'sysprops-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) { toast.parentNode.removeChild(toast); }
    }, 2500);
  }

  // -------------------------------------------------------------------------
  // DOM helpers
  // -------------------------------------------------------------------------

  // Shared translucent overlay backdrop for nested dialogs
  function buildOverlay() {
    var el = document.createElement('div');
    el.className = 'sysprops-nested-overlay';
    return el;
  }

  // Nested dialog box shell
  function buildNestedDialog(extraClass) {
    var el = document.createElement('div');
    el.className = 'sysprops-nested-dialog' + (extraClass ? ' ' + extraClass : '');
    return el;
  }

  // Titlebar with X close button
  function buildTitlebar(box, title, onClose) {
    var tb = document.createElement('div');
    tb.className = 'win98-window__titlebar';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'win98-window__title';
    titleSpan.textContent = title;

    var ctrls = document.createElement('span');
    ctrls.className = 'win98-window__controls';
    var xBtn = document.createElement('button');
    xBtn.className = 'win98-window__btn';
    xBtn.textContent = '\u00D7';
    xBtn.setAttribute('aria-label', 'Close');
    xBtn.addEventListener('click', onClose);
    ctrls.appendChild(xBtn);

    tb.appendChild(titleSpan);
    tb.appendChild(ctrls);
    box.appendChild(tb);
  }

  // Remove overlay from DOM and detach key handler
  function removeOverlay(overlay, keyHandler) {
    if (overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
    document.removeEventListener('keydown', keyHandler);
  }

  // Focus-trap + Escape handler for nested dialogs
  function makeTrapHandler(box, closeFn) {
    return function (e) {
      if (e.key === 'Escape') { closeFn(); return; }
      if (e.key !== 'Tab') { return; }
      var focusable = Array.from(
        box.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (!focusable.length) { e.preventDefault(); return; }
      var idx = focusable.indexOf(document.activeElement);
      if (e.shiftKey) {
        if (idx <= 0) { e.preventDefault(); focusable[focusable.length - 1].focus(); }
      } else {
        if (idx === focusable.length - 1) { e.preventDefault(); focusable[0].focus(); }
      }
    };
  }

  // Win98-style button
  function makeSyspropsBtn(label, onClick) {
    var btn = document.createElement('button');
    btn.className = 'sysprops-btn';
    btn.textContent = label;
    if (onClick) { btn.addEventListener('click', onClick); }
    return btn;
  }

  // Label + value field row
  function addField(container, label, value) {
    var row = document.createElement('div');
    row.className = 'sysprops-props-field';
    var lbl = document.createElement('span');
    lbl.className = 'sysprops-props-field__label';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.className = 'sysprops-props-field__value';
    val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    container.appendChild(row);
    return row;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return { buildContent: buildContent };

}());
