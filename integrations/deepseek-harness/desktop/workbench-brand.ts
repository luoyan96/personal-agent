/** Client code for the desktop-owned DSH extension. Slot registrations follow
 * their declaring surfaces through mount and disposal, including new sessions. */
export function workbenchBrandClient(avatar: string) {
  return `
  const { jsx, jsxs } = loadDshModule('react/jsx-runtime');
  const mark = ({ size }) => jsx('img', {
    src: ${JSON.stringify(avatar)}, alt: '', width: size, height: size,
    style: { display: 'block', objectFit: 'contain' },
  });
  // The host header owns the wordmark. Keep DSH's native new-session and
  // collapse controls on a single row when the sidebar is expanded.
  const sidebarLayout = () => jsx('style', {
    className: 'deepchat-sidebar-layout',
    children: [
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) { position: relative; height: 0; padding: 0; margin: 8px 0 0; overflow: visible; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) > :has(.deepchat-sidebar-layout) { display: none; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) [class*="_toggle"] { position: absolute; right: 0; top: 0; height: 38px; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) ~ button[class*="_newSession"] { margin-right: 40px; }',
    ].join(' '),
  });
  const hero = () => jsxs('span', {
    className: 'deepchat-welcome',
    style: { display: 'inline-flex', alignItems: 'center', gap: '0.6em', fontSize: 'clamp(16px, 2.5vw, 24px)' },
    children: [
      jsx('style', { children: '[class$="_headline"]:has(.deepchat-welcome) > [class$="_titleGroup"] { display: none }' }),
      mark({ size: 40 }), jsx('span', { children: '最近在琢磨什么问题？一起聊聊吧。' }),
    ],
  });
  for (const [name, component] of [
    ['sidebar.brand.mark', () => null], ['sidebar.brand.name', sidebarLayout],
    ['conversation.hero.brand.mark', hero],
  ]) {
    ctx.slots.inject(name, function* () {
      yield ctx.slots.register({ name, priority: -1 }, component);
    });
  }

  // Older research plugins use the host's entries in the native More menu.
  const researchEntries = ['research-literature', 'research-documents', 'research-slides', 'research-contests'];
  const hasFourResearchEntries = entries => researchEntries.every(id => entries.some(entry => entry.id === id));
  const secondary = new Set([
    'schedules', 'research-proposals', 'research-ip', 'research-ccf',
    'research-competitions', 'research-servers',
  ]);
  const { MenuItemButton } = loadDshModule('@deepseek-ai/dsh-client-ui-primitives');
  const { resolveSlotLabel } = loadDshModule('@deepseek-ai/dsh-client-ui-slots');
  const moreName = 'sidebar.panellist.actions';
  const panelName = 'sidebar.panellist';
  ctx.effect(() => {
    const open = ({ detail }) => {
      if (!detail || !researchEntries.includes(detail.panel) ||
          !hasFourResearchEntries(ctx.slots.entriesOfSlot(panelName).map(({ options }) => options))) return;
      if (detail.open) {
        ctx.layout.selectPanel(detail.panel);
        window.dispatchEvent(new CustomEvent('deepchat-workbench-use-in'));
      }
      window.dispatchEvent(new CustomEvent('deepchat-material-panel-ready', { detail: detail.nonce }));
    };
    window.addEventListener('deepchat-prepare-material-panel', open);
    return () => window.removeEventListener('deepchat-prepare-material-panel', open);
  }, 'DeepChat material navigation');
  const secondaryTools = ({ entries, onOpen, onDismiss }) => {
    if (hasFourResearchEntries(entries)) return null;
    return entries.filter(({ id }) => secondary.has(id)).map(({ id, label, active }) =>
      jsx(MenuItemButton, {
        current: active,
        onSelect: () => {
          onDismiss();
          onOpen(id);
        },
        children: label,
      }, id));
  };
  ctx.slots.inject(moreName, () =>
    ctx.slots.register({ name: moreName, id: 'deepchat-secondary-tools', order: -10 }, secondaryTools));
  ctx.effect(() => {
    const style = document.createElement('style');
    style.className = 'deepchat-sidebar-tools';
    document.head.appendChild(style);
    const refreshTools = () => {
      const panels = ctx.slots.entriesOfSlot(panelName).map(({ options }) => ({
        id: options.id,
        label: resolveSlotLabel(options.label) ?? options.id,
      }));
      const uniqueLabels = new Set(panels.map(({ label }) => label));
      for (const { label } of panels.filter(({ id }) => !secondary.has(id))) uniqueLabels.delete(label);
      const panelList = 'nav[class$="_panelList"]';
      const moreAnchor = panelList + ' [class$="_moreAnchor"]';
      const collapsed = 'html:not([data-windows-titlebar]) [class*="_collapsed"]';
      const buttons = [
        collapsed + ' button[class*="_panelRow"][aria-label]',
        collapsed + ' button[class*="_newSession"][aria-label]',
      ];
      // DSH owns its 56px compact rail. Retain its controls and accessible
      // names, then make the same names visible under the compact icons.
      style.textContent = [
        // DSH rc.3 renders the More menu in a portal. Hide both its wrapper
        // and any open menu when the four research panels are registered.
        hasFourResearchEntries(panels)
          ? moreAnchor + ', [role="menu"][class*="_moreMenu"] { display: none !important; }'
          : moreAnchor + ' button[class$="_panelRow"][aria-haspopup="menu"] { display: flex !important; }',
        buttons.join(',') + ' { flex-direction: column; gap: 2px; width: calc(100% - 4px); max-width: 52px; height: auto; min-height: 40px; justify-content: center; margin-inline: 2px; padding: 4px 2px; }',
        buttons.map(selector => selector + '::after').join(',') + ' { content: attr(aria-label); color: inherit; font-size: 10px; line-height: 12px; text-align: center; white-space: normal; overflow-wrap: anywhere; }',
        ...panels.filter(({ id, label }) => secondary.has(id) && uniqueLabels.has(label))
          .map(({ label }) => panelList + ' button[class*="_panelRow"][aria-label="' + CSS.escape(label) + '"] { display: none; }'),
      ].join(' ');
    };
    const unsubscribePanels = ctx.slots.subscribe(panelName, refreshTools);
    const unsubscribeLocale = ctx.locale.subscribe(refreshTools);
    refreshTools();
    return () => {
      unsubscribePanels();
      unsubscribeLocale();
      style.remove();
    };
  }, 'DeepChat workbench tools');
  `;
}
