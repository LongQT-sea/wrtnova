// The three-region chassis both pages sit in.
//
//   +--------------+-------------------------------+------------------+
//   | SECTIONS     | SECTION CONTENT               | PLAN  (sticky)   |
//   +--------------+-------------------------------+------------------+
//
// The rail gives direct access to all eight sections rather than sequencing them:
// this is not a wizard, and a returning user changing one setting should not walk
// a sequence. The order is still the order a first-timer would answer them in.
//
// On a phone the rail becomes a horizontally scrolling tab strip pinned under the
// header, and the right region becomes a bottom sheet behind a persistent summary
// bar -- so the build action and the router address never leave the screen.

import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { LangSwitcher } from './LangSwitcher';
import { t } from '@i18n/index';

export interface ShellSection {
  id: string;
  label: string;
  /**
   * Rendered at the rail item's trailing edge. Given as an element rather than a
   * boolean so the component behind it can own its own store subscription: the
   * shell must not re-render on every keystroke, or the selector-level
   * subscriptions in the form below it buy nothing.
   */
  badge?: ReactNode;
}

export interface AppShellProps {
  title: string;
  subtitle?: string;
  /** Links and controls in the header's trailing edge. */
  headerExtra?: ReactNode;
  sections: readonly ShellSection[];
  active: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  /** The right region. Sticky on desktop, a bottom sheet on a phone. */
  panel: ReactNode;
  /** The always-visible line on the phone summary bar. */
  panelSummary: ReactNode;
  panelTitle: string;
}

/**
 * The bar every page wears: the wordmark, what the page is, and the two
 * preferences. Exported because the fleet's network list is a plain page rather
 * than the three-region chassis, and it must still be the same product.
 */
export function PageBar({
  title,
  subtitle,
  headerExtra,
}: {
  title: string;
  subtitle?: string;
  headerExtra?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-5">
      <a href="/" className="flex items-baseline gap-1.5 no-underline">
        <span className="font-display text-lg font-bold tracking-tight text-ink">
          Wrt<span className="text-seg-lan">Nova</span>
        </span>
        {subtitle ? <span className="hidden text-xs text-ink-soft sm:inline">{subtitle}</span> : null}
      </a>
      <span className="sr-only">{title}</span>
      <div className="ml-auto flex items-center gap-1.5">
        {headerExtra}
        <LangSwitcher />
        <ThemeToggle />
      </div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  const { title, subtitle, headerExtra, sections, active, onSelect } = props;
  const { children, panel, panelSummary, panelTitle } = props;
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur">
        <PageBar
          title={title}
          {...(subtitle === undefined ? {} : { subtitle })}
          {...(headerExtra === undefined ? {} : { headerExtra })}
        />

        {/* Phone: the rail, as a scrolling tab strip. */}
        <nav
          aria-label={t('sectionsNav')}
          className="flex gap-1 overflow-x-auto border-t border-rule px-3 py-1.5 lg:hidden"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className="rail-item w-auto flex-none"
              aria-current={s.id === active}
              onClick={() => onSelect(s.id)}
            >
              {s.label}
              {s.badge}
            </button>
          ))}
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-3 py-4 sm:px-5 lg:grid-cols-[13rem_minmax(0,1fr)_21rem] lg:gap-5">
        {/* Desktop: the rail. */}
        <nav aria-label={t('sectionsNav')} className="hidden lg:block">
          <div className="sticky top-20 space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className="rail-item"
                aria-current={s.id === active}
                onClick={() => onSelect(s.id)}
              >
                <span className="flex-1">{s.label}</span>
                {s.badge}
              </button>
            ))}
          </div>
        </nav>

        <main className="min-w-0 pb-20 lg:pb-0">{children}</main>

        <aside className="hidden lg:block">
          <div className="sticky top-20">{panel}</div>
        </aside>
      </div>

      {/* Phone: the persistent summary bar and the sheet it opens. */}
      <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-surface px-3 py-2 lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 text-xs">{panelSummary}</div>
            <Dialog.Trigger asChild>
              <button type="button" className="btn btn-quiet flex-none">
                {panelTitle}
              </button>
            </Dialog.Trigger>
          </div>
        </div>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[var(--radius-card)] border-t border-rule bg-ground p-3 lg:hidden">
            <div className="mb-2 flex items-center justify-between">
              <Dialog.Title className="font-display text-base font-semibold">
                {panelTitle}
              </Dialog.Title>
              <Dialog.Close className="btn btn-ghost px-2" aria-label={t('cancel')}>
                &times;
              </Dialog.Close>
            </div>
            {panel}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
