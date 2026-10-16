import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight } from 'lucide-react'

// Items: { label, run, sub:[…], checked, danger, disabled } or '-'. Radix gives keyboard nav, typeahead,
// collision-aware submenus and focus handling.
export function MenuItems({ items }) {
  if (items.length === 0) return <div className="mi disabled">vazio</div>
  return items.map((it, i) =>
    it === '-' ? (
      <DropdownMenu.Separator key={i} className="menu-sep" />
    ) : it.sub ? (
      <DropdownMenu.Sub key={i}>
        <DropdownMenu.SubTrigger className="mi">
          <span>{it.label}</span>
          <ChevronRight size={14} />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent className="menu" sideOffset={6} alignOffset={-7}>
            <MenuItems items={it.sub} />
          </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
    ) : (
      <DropdownMenu.Item key={i} className={'mi' + (it.danger ? ' danger' : '')} disabled={it.disabled} onSelect={() => it.run()}>
        <span>{it.label}</span>
        {it.checked && <Check size={14} />}
      </DropdownMenu.Item>
    ),
  )
}

// Opened programmatically at the pointer: a zero-size fixed anchor stands in for the trigger.
export function Menu({ x, y, items, onClose }) {
  return (
    <DropdownMenu.Root open onOpenChange={(o) => !o && onClose()}>
      <DropdownMenu.Trigger asChild>
        <span className="menu-anchor" style={{ left: x, top: y }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align="start" sideOffset={2} onCloseAutoFocus={(e) => e.preventDefault()}>
          <MenuItems items={items} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
