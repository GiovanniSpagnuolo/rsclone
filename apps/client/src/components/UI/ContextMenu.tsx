import { useEffect, useRef } from 'react';

interface ContextMenuProps {
  menuState: { x: number; y: number; spawn: any; def: any } | null;
  onClose: () => void;
  onActionSelect: (actionKey: string, spawn: any, def: any) => void;
}

export const ContextMenu = ({ menuState, onClose, onActionSelect }: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // If the menu is closed, don't listen for outside clicks at all
        if (!menuState) return;

        const handleClickOutside = (e: Event) => {
          if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
            onClose();
          }
        };

        // Wait 1 tick for the opening 'pointerdown' to finish bubbling up the DOM
        const timer = setTimeout(() => {
          window.addEventListener('pointerdown', handleClickOutside);
        }, 0);

        return () => {
          clearTimeout(timer);
          window.removeEventListener('pointerdown', handleClickOutside);
        };
      }, [menuState, onClose]);

  const getOptions = () => {
    if (!menuState) return [];
    
    const { def } = menuState;
    const options = [];
    
    if (def.interactableData) {
      try {
        const data = typeof def.interactableData === 'string' ? JSON.parse(def.interactableData) : def.interactableData;
        if (data && data.actions) {
          Object.keys(data.actions).forEach(actionName => {
            options.push({ label: `${actionName} ${def.name}`, actionKey: actionName });
          });
        }
      } catch (e) {}
    }
    
    options.push({ label: `Examine ${def.name}`, actionKey: 'Examine' });
    options.push({ label: 'Cancel', actionKey: 'Cancel' });
    
    return options;
  };

  const handleAction = (actionKey: string) => {
    if (!menuState) return;
    
    if (actionKey === 'Cancel') {
      onClose();
      return;
    }
    onActionSelect(actionKey, menuState.spawn, menuState.def);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{
        display: menuState ? 'block' : 'none',
        position: 'absolute',
        top: menuState?.y || 0,
        left: menuState?.x || 0,
        zIndex: 100,
        backgroundColor: '#4a3b22',
        border: '2px solid #2a1b02',
        color: '#f0e68c',
        fontFamily: 'monospace',
        width: '180px',
        boxShadow: '2px 2px 5px rgba(0,0,0,0.5)',
        cursor: 'default'
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {getOptions().map((opt, i) => (
        <div
          key={i}
          onPointerUp={(e) => {
            e.stopPropagation();
            handleAction(opt.actionKey);
          }}
          style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid #2a1b02' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5c4a2e'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
};
